import { App, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/** Name used to prefix stack names and physical resource names. */
export const APP_NAME = 'agentcore-waniwani-mcp-funnel';

/** OAuth scope a client must hold to call the MCP server. */
export const RESOURCE_SERVER_IDENTIFIER = 'solar-quote';
export const INVOKE_SCOPE_NAME = 'invoke';

export const ENVIRONMENT_NAMES = ['dev', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface EnvironmentConfig {
  /** Logical environment the stacks are deployed into. */
  readonly envName: EnvironmentName;
  /** Target account, resolved from the ambient CDK environment. */
  readonly account?: string;
  /** Target region, resolved from the ambient CDK environment. */
  readonly region: string;
  /** CloudWatch Logs retention applied to Lambda log groups. */
  readonly logRetention: RetentionDays;
  /** Removal policy applied to stateful resources. */
  readonly removalPolicy: RemovalPolicy;
  /** Whether DynamoDB point-in-time recovery is enabled on the leads table. */
  readonly pointInTimeRecovery: boolean;
  /** How long an idle AgentCore Runtime session keeps its microVM. */
  readonly runtimeIdleTimeout: Duration;
  /**
   * ARN of a Secrets Manager secret holding a WaniWani Platform API key.
   * Optional: without it the flow engine runs with no WaniWani account.
   * Set with `-c waniwaniApiKeySecretArn=arn:aws:secretsmanager:...`.
   */
  readonly waniwaniApiKeySecretArn?: string;
}

type EnvironmentDefaults = Omit<
  EnvironmentConfig,
  'envName' | 'account' | 'region' | 'waniwaniApiKeySecretArn'
>;

const ENVIRONMENT_DEFAULTS: Record<EnvironmentName, EnvironmentDefaults> = {
  dev: {
    logRetention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
    pointInTimeRecovery: false,
    runtimeIdleTimeout: Duration.minutes(5),
  },
  prod: {
    logRetention: RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
    runtimeIdleTimeout: Duration.minutes(15),
  },
};

/**
 * Resolves the target environment from CDK context, e.g. `cdk deploy -c env=prod`.
 * Defaults to `dev` (see the `env` entry in cdk.json).
 */
export function resolveEnvironmentName(app: App): EnvironmentName {
  const value = (app.node.tryGetContext('env') as string | undefined) ?? 'dev';
  const match = ENVIRONMENT_NAMES.find((name) => name === value);

  if (!match) {
    throw new Error(
      `Unknown environment "${value}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}.`,
    );
  }

  return match;
}

/** Builds the environment configuration for the current CDK app. */
export function getConfig(app: App): EnvironmentConfig {
  const envName = resolveEnvironmentName(app);
  const waniwaniApiKeySecretArn = app.node.tryGetContext('waniwaniApiKeySecretArn') as
    string | undefined;

  return {
    envName,
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
    waniwaniApiKeySecretArn: waniwaniApiKeySecretArn || undefined,
    ...ENVIRONMENT_DEFAULTS[envName],
  };
}
