import type { Context } from 'aws-lambda';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
const TABLE_NAME = process.env.TABLE_NAME ?? '';

export interface McpServerEvent {
  readonly [key: string]: unknown;
}

export interface McpServerResult {
  readonly statusCode: number;
  readonly body: string;
}

/**
 * Placeholder handler for Serverless MCP Server.
 *
 * TODO: replace with the real implementation. This exists so that the stacks
 * synthesise and deploy on day one.
 */
export const handler = async (
  event: McpServerEvent,
  context: Context,
): Promise<McpServerResult> => {
  console.log(
    JSON.stringify({
      message: 'Serverless MCP Server placeholder invocation',
      requestId: context.awsRequestId,
      environment: ENVIRONMENT,
      tableName: TABLE_NAME,
      event,
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Serverless MCP Server placeholder handler',
      environment: ENVIRONMENT,
    }),
  };
};
