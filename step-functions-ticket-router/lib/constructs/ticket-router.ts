import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  Choice,
  Condition,
  DefinitionBody,
  IChainable,
  JsonPath,
  LogLevel,
  StateMachine,
  StateMachineType,
  TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  DynamoAttributeValue,
  DynamoPutItem,
  LambdaInvoke,
  SqsSendMessage,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { ROUTES } from '../../src/shared/routing';
import type { RouteQueues } from '../stateful-stack';

export interface TicketRouterProps {
  /** State machine name, also used for its log group. */
  readonly stateMachineName: string;
  /** Lambda that takes `{ ticket }` and returns a `RouteDecision`. */
  readonly classifier: IFunction;
  readonly decisionsTable: ITable;
  readonly queues: RouteQueues;
  readonly logRetention: RetentionDays;
  readonly removalPolicy: RemovalPolicy;
  /**
   * Route confidence below which a ticket goes to human review instead of a
   * queue. Only applies to providers that report a confidence.
   */
  readonly minRouteConfidence?: number;
}

/**
 * Express workflow: classify a ticket, record the decision, then let a Choice
 * state send it to a queue.
 *
 * The definition is the same for every provider. Only `classifier` changes,
 * which is what makes the latency and cost comparison fair.
 */
export class TicketRouter extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: TicketRouterProps) {
    super(scope, id);

    const { classifier, decisionsTable, queues, minRouteConfidence = 0.6 } = props;

    const sendTo = (stateName: string, queueKey: string, queue: RouteQueues['humanReview']) =>
      new SqsSendMessage(this, stateName, {
        queue,
        messageBody: TaskInput.fromJsonPathAt('$'),
        resultSelector: { queue: queueKey, 'messageId.$': '$.MessageId' },
        resultPath: '$.delivery',
      });

    const humanReview = sendTo('Send to human review', 'human_review', queues.humanReview);

    const classify = new LambdaInvoke(this, 'Classify ticket', {
      lambdaFunction: classifier,
      payload: TaskInput.fromObject({ 'ticket.$': '$.ticket' }),
      payloadResponseOnly: true,
      resultPath: '$.decision',
      retryOnServiceExceptions: true,
    });
    // Model calls fail transiently (throttling, timeouts). Retry, then fail safe.
    classify.addRetry({
      errors: ['States.TaskFailed'],
      interval: Duration.seconds(1),
      maxAttempts: 2,
      backoffRate: 2,
    });
    classify.addCatch(humanReview, { resultPath: '$.error' });

    const record = new DynamoPutItem(this, 'Record decision', {
      table: decisionsTable,
      item: {
        ticketId: DynamoAttributeValue.fromString(JsonPath.stringAt('$.decision.ticketId')),
        provider: DynamoAttributeValue.fromString(JsonPath.stringAt('$.decision.provider')),
        route: DynamoAttributeValue.fromString(JsonPath.stringAt('$.decision.route')),
        urgency: DynamoAttributeValue.fromString(JsonPath.stringAt('$.decision.urgency')),
        latencyMs: DynamoAttributeValue.numberFromString(
          // DynamoDB number attributes are sent as strings.
          JsonPath.format('{}', JsonPath.stringAt('$.decision.latencyMs')),
        ),
        decision: DynamoAttributeValue.fromString(
          JsonPath.jsonToString(JsonPath.objectAt('$.decision')),
        ),
        executionId: DynamoAttributeValue.fromString(JsonPath.executionId),
      },
      resultPath: JsonPath.DISCARD,
    });

    const routeChoice = new Choice(this, 'Route ticket')
      .when(Condition.booleanEquals('$.decision.needsHuman', true), humanReview, {
        comment: 'The model flagged the ticket for a senior agent.',
      })
      .when(Condition.stringEquals('$.decision.urgency', 'critical'), humanReview, {
        comment: 'Critical tickets skip the queues.',
      })
      .when(
        Condition.and(
          Condition.isNumeric('$.decision.routeConfidence'),
          Condition.numberLessThan('$.decision.routeConfidence', minRouteConfidence),
        ),
        humanReview,
        { comment: 'Low-confidence routes. Only providers that report a confidence hit this.' },
      );

    for (const route of ROUTES.filter((name) => name !== 'general')) {
      routeChoice.when(
        Condition.stringEquals('$.decision.route', route),
        sendTo(`Send to ${route}`, route, queues.routes[route]),
      );
    }
    routeChoice.otherwise(sendTo('Send to general', 'general', queues.routes.general));

    const definition: IChainable = classify.next(record).next(routeChoice);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineName: props.stateMachineName,
      stateMachineType: StateMachineType.EXPRESS,
      definitionBody: DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(2),
      tracingEnabled: true,
      logs: {
        destination: new LogGroup(this, 'LogGroup', {
          logGroupName: `/aws/vendedlogs/states/${props.stateMachineName}`,
          retention: props.logRetention,
          removalPolicy: props.removalPolicy,
        }),
        level: LogLevel.ALL,
        includeExecutionData: true,
      },
    });
  }
}
