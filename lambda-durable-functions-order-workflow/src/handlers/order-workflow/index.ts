import type { Context } from 'aws-lambda';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
const TABLE_NAME = process.env.TABLE_NAME ?? '';

export interface OrderWorkflowEvent {
  readonly [key: string]: unknown;
}

export interface OrderWorkflowResult {
  readonly statusCode: number;
  readonly body: string;
}

/**
 * Placeholder handler for Lambda Durable Functions Order Workflow.
 *
 * TODO: replace with the real implementation. This exists so that the stacks
 * synthesise and deploy on day one.
 */
export const handler = async (
  event: OrderWorkflowEvent,
  context: Context,
): Promise<OrderWorkflowResult> => {
  console.log(
    JSON.stringify({
      message: 'Lambda Durable Functions Order Workflow placeholder invocation',
      requestId: context.awsRequestId,
      environment: ENVIRONMENT,
      tableName: TABLE_NAME,
      event,
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Lambda Durable Functions Order Workflow placeholder handler',
      environment: ENVIRONMENT,
    }),
  };
};
