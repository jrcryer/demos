import { App, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL } from '../../src/shared/models';

/** Name used to prefix stack names and physical resource names. */
export const APP_NAME = 'step-functions-ticket-router';

export const ENVIRONMENT_NAMES = ['dev', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface EnvironmentConfig {
  /** Logical environment the stacks are deployed into. */
  readonly envName: EnvironmentName;
  /** Target account, resolved from the ambient CDK environment. */
  readonly account?: string;
  /** Target region, resolved from the ambient CDK environment. */
  readonly region: string;
  /** CloudWatch Logs retention applied to Lambda and state machine log groups. */
  readonly logRetention: RetentionDays;
  /** Removal policy applied to stateful resources. */
  readonly removalPolicy: RemovalPolicy;
  /** Whether DynamoDB point-in-time recovery is enabled. */
  readonly pointInTimeRecovery: boolean;
  /** Memory allocated to the router Lambda functions. */
  readonly lambdaMemorySize: number;
  /** Timeout applied to the router Lambda functions. */
  readonly lambdaTimeout: Duration;
  /** OpenAI model used by the Decisions API router (`-c openaiModel=...`). */
  readonly openaiModel: string;
  /** Bedrock model ID used by the Claude router (`-c claudeModel=...`). */
  readonly claudeModel: string;
}

type EnvironmentDefaults = Omit<
  EnvironmentConfig,
  'envName' | 'account' | 'region' | 'openaiModel' | 'claudeModel'
>;

const ENVIRONMENT_DEFAULTS: Record<EnvironmentName, EnvironmentDefaults> = {
  dev: {
    logRetention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
    pointInTimeRecovery: false,
    lambdaMemorySize: 512,
    lambdaTimeout: Duration.seconds(30),
  },
  prod: {
    logRetention: RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.RETAIN,
    pointInTimeRecovery: true,
    lambdaMemorySize: 1024,
    lambdaTimeout: Duration.seconds(30),
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

  return {
    envName,
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
    openaiModel:
      (app.node.tryGetContext('openaiModel') as string | undefined) ?? DEFAULT_OPENAI_MODEL,
    claudeModel:
      (app.node.tryGetContext('claudeModel') as string | undefined) ?? DEFAULT_CLAUDE_MODEL,
    ...ENVIRONMENT_DEFAULTS[envName],
  };
}
