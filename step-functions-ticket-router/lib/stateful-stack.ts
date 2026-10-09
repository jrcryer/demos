import { CfnOutput, Duration, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { IQueue, Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { ROUTES, Route } from '../src/shared/routing';
import { EnvironmentConfig } from './shared/config';

export interface StatefulStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/** One queue per route, plus a queue for tickets that need a human first. */
export interface RouteQueues {
  readonly routes: Record<Route, IQueue>;
  readonly humanReview: IQueue;
}

/**
 * Stateful resources: anything whose lifecycle must outlive a deployment of the
 * application code (data stores, buckets, queues with retained messages).
 */
export class StatefulStack extends Stack {
  /** Every routing decision, keyed by ticket and provider, for comparison. */
  public readonly decisionsTable: ITable;
  /** Holds the OpenAI API key. Set its value after the first deploy. */
  public readonly openaiSecret: ISecret;
  public readonly queues: RouteQueues;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.decisionsTable = new Table(this, 'DecisionsTable', {
      partitionKey: { name: 'ticketId', type: AttributeType.STRING },
      sortKey: { name: 'provider', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.pointInTimeRecovery,
      },
      removalPolicy: config.removalPolicy,
    });

    this.openaiSecret = new Secret(this, 'OpenAiApiKey', {
      description: 'OpenAI API key used by the Decisions API ticket router',
      // A placeholder, so no key ever lands in a template. Replace it after deploy.
      secretStringValue: SecretValue.unsafePlainText('REPLACE_ME'),
      removalPolicy: config.removalPolicy,
    });

    const queue = (name: string): IQueue =>
      new Queue(this, `${name}Queue`, {
        encryption: QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        retentionPeriod: Duration.days(4),
        removalPolicy: config.removalPolicy,
      });

    const pascal = (route: string): string =>
      route.replace(/(^|_)([a-z])/g, (_match, _sep, char: string) => char.toUpperCase());

    this.queues = {
      routes: Object.fromEntries(ROUTES.map((route) => [route, queue(pascal(route))])) as Record<
        Route,
        IQueue
      >,
      humanReview: queue('HumanReview'),
    };

    new CfnOutput(this, 'DecisionsTableName', {
      value: this.decisionsTable.tableName,
      description: 'DynamoDB table holding every routing decision',
    });

    new CfnOutput(this, 'OpenAiSecretName', {
      value: this.openaiSecret.secretName,
      description: 'Secret to put the OpenAI API key in',
    });
  }
}
