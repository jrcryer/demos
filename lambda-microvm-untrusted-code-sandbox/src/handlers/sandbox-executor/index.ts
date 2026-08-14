import type { Context } from 'aws-lambda';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
const TABLE_NAME = process.env.TABLE_NAME ?? '';

export interface SandboxExecutorEvent {
  readonly [key: string]: unknown;
}

export interface SandboxExecutorResult {
  readonly statusCode: number;
  readonly body: string;
}

/**
 * Placeholder handler for Lambda MicroVM Untrusted Code Sandbox.
 *
 * TODO: replace with the real implementation. This exists so that the stacks
 * synthesise and deploy on day one.
 */
export const handler = async (
  event: SandboxExecutorEvent,
  context: Context,
): Promise<SandboxExecutorResult> => {
  console.log(
    JSON.stringify({
      message: 'Lambda MicroVM Untrusted Code Sandbox placeholder invocation',
      requestId: context.awsRequestId,
      environment: ENVIRONMENT,
      tableName: TABLE_NAME,
      event,
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Lambda MicroVM Untrusted Code Sandbox placeholder handler',
      environment: ENVIRONMENT,
    }),
  };
};
