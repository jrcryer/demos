import * as path from 'node:path';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { TicketRouter } from './constructs/ticket-router';
import { CLAUDE_FALLBACK_MODEL, foundationModelId } from '../src/shared/models';
import { APP_NAME, EnvironmentConfig } from './shared/config';
import type { RouteQueues } from './stateful-stack';

export interface StatelessStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly decisionsTable: ITable;
  readonly openaiSecret: ISecret;
  readonly queues: RouteQueues;
}

/**
 * Stateless resources: the two classifier functions and the two state
 * machines that use them. Everything here can be torn down and recreated
 * without data loss.
 */
export class StatelessStack extends Stack {
  public readonly decisionsRouter: TicketRouter;
  public readonly claudeRouter: TicketRouter;

  constructor(scope: Construct, id: string, props: StatelessStackProps) {
    super(scope, id, props);

    const { config, decisionsTable, openaiSecret, queues } = props;

    const routerFunction = (
      name: string,
      handlerDir: string,
      description: string,
      environment: Record<string, string>,
    ): NodejsFunction => {
      const functionName = `${APP_NAME}-${config.envName}-${name}`;
      return new NodejsFunction(this, `${handlerDir}Function`, {
        functionName,
        description,
        entry: path.join(__dirname, '..', 'src', 'handlers', name, 'index.ts'),
        handler: 'handler',
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: config.lambdaMemorySize,
        timeout: config.lambdaTimeout,
        tracing: Tracing.ACTIVE,
        logGroup: new LogGroup(this, `${handlerDir}LogGroup`, {
          logGroupName: `/aws/lambda/${functionName}`,
          retention: config.logRetention,
          removalPolicy: config.removalPolicy,
        }),
        environment: {
          ENVIRONMENT: config.envName,
          NODE_OPTIONS: '--enable-source-maps',
          ...environment,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          target: 'node22',
        },
      });
    };

    const decisionsFunction = routerFunction(
      'decisions-router',
      'DecisionsRouter',
      `Routes support tickets with the OpenAI Decisions API (${config.envName})`,
      { OPENAI_SECRET_ARN: openaiSecret.secretArn, OPENAI_MODEL: config.openaiModel },
    );
    openaiSecret.grantRead(decisionsFunction);

    const claudeFunction = routerFunction(
      'claude-router',
      'ClaudeRouter',
      `Routes support tickets with Claude on Amazon Bedrock (${config.envName})`,
      { CLAUDE_MODEL: config.claudeModel },
    );
    // A cross-Region inference profile needs InvokeModel on the profile itself
    // and on the foundation model in every Region it can route to. Global
    // profiles also check the Region-less foundation model ARN.
    const claudeModels = [config.claudeModel, CLAUDE_FALLBACK_MODEL];
    claudeFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: claudeModels.flatMap((modelId) => {
          const foundation = foundationModelId(modelId);
          return [
            ...(foundation === modelId
              ? []
              : [
                  `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/${modelId}`,
                ]),
            `arn:${this.partition}:bedrock:*::foundation-model/${foundation}`,
            `arn:${this.partition}:bedrock:::foundation-model/${foundation}`,
          ];
        }),
      }),
    );

    const router = (id: string, name: string, classifier: NodejsFunction): TicketRouter =>
      new TicketRouter(this, id, {
        stateMachineName: `${APP_NAME}-${config.envName}-${name}`,
        classifier,
        decisionsTable,
        queues,
        logRetention: config.logRetention,
        removalPolicy: config.removalPolicy,
      });

    this.decisionsRouter = router('DecisionsTicketRouter', 'decisions', decisionsFunction);
    this.claudeRouter = router('ClaudeTicketRouter', 'claude', claudeFunction);

    new CfnOutput(this, 'DecisionsStateMachineArn', {
      value: this.decisionsRouter.stateMachine.stateMachineArn,
      description: 'Ticket router backed by the OpenAI Decisions API',
    });

    new CfnOutput(this, 'ClaudeStateMachineArn', {
      value: this.claudeRouter.stateMachine.stateMachineArn,
      description: 'Ticket router backed by Claude on Amazon Bedrock',
    });
  }
}
