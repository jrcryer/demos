import * as path from 'node:path';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  AgentRuntimeArtifact,
  ProtocolType,
  Runtime,
  RuntimeAuthorizerConfiguration,
} from 'aws-cdk-lib/aws-bedrockagentcore';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Architecture, Runtime as LambdaRuntime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { LEAD_EVENT_DETAIL_TYPE, LEAD_EVENT_SOURCE } from '../src/shared/lead';
import {
  APP_NAME,
  EnvironmentConfig,
  INVOKE_SCOPE_NAME,
  RESOURCE_SERVER_IDENTIFIER,
} from './shared/config';

export interface StatelessStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly flowStateTable: ITable;
  readonly leadsTable: ITable;
  readonly userPool: IUserPool;
  readonly mcpClient: IUserPoolClient;
}

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Stateless resources: the MCP server on AgentCore Runtime and the event-driven
 * lead hand-off. Everything here can be torn down and recreated without data loss.
 */
export class StatelessStack extends Stack {
  public readonly runtime: Runtime;

  constructor(scope: Construct, id: string, props: StatelessStackProps) {
    super(scope, id, props);

    const { config, flowStateTable, leadsTable, userPool, mcpClient } = props;

    // --- Lead hand-off: MCP server -> EventBridge -> Lambda -> DynamoDB -------

    const eventBus = new EventBus(this, 'LeadEventBus');

    const recorderName = `${APP_NAME}-${config.envName}-lead-recorder`;
    const leadRecorder = new NodejsFunction(this, 'LeadRecorderFunction', {
      functionName: recorderName,
      description: `Persists leads captured by the solar quote funnel (${config.envName})`,
      entry: path.join(PROJECT_ROOT, 'src', 'handlers', 'lead-recorder', 'index.ts'),
      handler: 'handler',
      runtime: LambdaRuntime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new LogGroup(this, 'LeadRecorderLogGroup', {
        logGroupName: `/aws/lambda/${recorderName}`,
        retention: config.logRetention,
        removalPolicy: config.removalPolicy,
      }),
      environment: {
        LEADS_TABLE_NAME: leadsTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { minify: true, sourceMap: true, target: 'node22' },
    });
    leadsTable.grantWriteData(leadRecorder);

    const deadLetterQueue = new Queue(this, 'LeadDeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    new Rule(this, 'LeadCapturedRule', {
      eventBus,
      eventPattern: { source: [LEAD_EVENT_SOURCE], detailType: [LEAD_EVENT_DETAIL_TYPE] },
      targets: [new LambdaFunction(leadRecorder, { deadLetterQueue, retryAttempts: 3 })],
    });

    // --- MCP server on AgentCore Runtime --------------------------------------

    const waniwaniSecret = config.waniwaniApiKeySecretArn
      ? Secret.fromSecretCompleteArn(this, 'WaniwaniApiKey', config.waniwaniApiKeySecretArn)
      : undefined;

    this.runtime = new Runtime(this, 'McpServerRuntime', {
      // Runtime names allow letters, digits and underscores only.
      runtimeName: `solar_quote_funnel_${config.envName}`,
      description: `WaniWani solar quote funnel MCP server (${config.envName})`,
      agentRuntimeArtifact: AgentRuntimeArtifact.fromAsset(PROJECT_ROOT, {
        // AgentCore Runtime runs ARM64 containers only.
        platform: Platform.LINUX_ARM64,
        // The build context is narrowed further by .dockerignore; these keep
        // the asset fingerprint from churning on (or recursing into) output.
        exclude: ['cdk.out', 'node_modules', 'dist', 'coverage', '.git'],
      }),
      protocolConfiguration: ProtocolType.MCP,
      authorizerConfiguration: RuntimeAuthorizerConfiguration.usingCognito(
        userPool,
        [mcpClient],
        undefined,
        [`${RESOURCE_SERVER_IDENTIFIER}/${INVOKE_SCOPE_NAME}`],
      ),
      lifecycleConfiguration: { idleRuntimeSessionTimeout: config.runtimeIdleTimeout },
      environmentVariables: {
        ENVIRONMENT: config.envName,
        FLOW_STATE_TABLE_NAME: flowStateTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
        ...(waniwaniSecret ? { WANIWANI_API_KEY_SECRET_ARN: waniwaniSecret.secretArn } : {}),
      },
    });

    flowStateTable.grantReadWriteData(this.runtime);
    eventBus.grantPutEventsTo(this.runtime);
    waniwaniSecret?.grantRead(this.runtime);

    new CfnOutput(this, 'RuntimeArn', {
      value: this.runtime.agentRuntimeArn,
      description: 'ARN of the AgentCore Runtime hosting the MCP server',
    });
    new CfnOutput(this, 'LeadEventBusName', { value: eventBus.eventBusName });
    new CfnOutput(this, 'LeadDeadLetterQueueUrl', { value: deadLetterQueue.queueUrl });
  }
}
