import { QUOTE_FLOW_ID, RESULT_TOOL_NAME } from './flow';

/**
 * One structured log line per MCP request.
 *
 * It records where a conversation is in the funnel, never what was said:
 * field names are logged, answers are not.
 */
export interface RequestLogEntry {
  message: 'mcp_request';
  /** The `Mcp-Session-Id` AgentCore Runtime assigns; groups a conversation's requests. */
  sessionId?: string;
  /** JSON-RPC method, e.g. `tools/call`. */
  method?: string;
  tool?: string;
  /** Flow action the model asked for: `start`, `continue` or `reset`. */
  flowAction?: string;
  /** Names of the state fields this request supplied values for. */
  answeredFields?: string[];
  /** Where the flow stopped: `interrupt`, `widget`, `complete` or `error`. */
  flowStatus?: string;
  /** Names of the fields the flow asked for next. */
  askedFields?: string[];
  /** How the funnel ended, logged when the result is shown. */
  outcome?: string;
  httpStatus: number;
  durationMs: number;
}

export type RequestLogger = (entry: RequestLogEntry) => void;

export const consoleRequestLogger: RequestLogger = (entry) => {
  console.log(JSON.stringify(entry));
};

type RequestDetails = Pick<
  RequestLogEntry,
  'method' | 'tool' | 'flowAction' | 'answeredFields' | 'outcome'
>;
type FlowResultDetails = Pick<RequestLogEntry, 'flowStatus' | 'askedFields'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** What the request asked for, read from the JSON-RPC body. */
export function describeRequest(body: unknown): RequestDetails {
  if (Array.isArray(body)) return { method: 'batch' };
  if (!isRecord(body)) return {};

  const details: RequestDetails = { method: stringOrUndefined(body.method) };
  if (details.method !== 'tools/call' || !isRecord(body.params)) return details;

  details.tool = stringOrUndefined(body.params.name);
  const args = isRecord(body.params.arguments) ? body.params.arguments : {};

  if (details.tool === QUOTE_FLOW_ID) {
    details.flowAction = stringOrUndefined(args.action);
    if (isRecord(args.stateUpdates)) details.answeredFields = Object.keys(args.stateUpdates);
  } else if (details.tool === RESULT_TOOL_NAME) {
    details.outcome = stringOrUndefined(args.outcome);
  }

  return details;
}

/** Where the flow stopped, read from the flow tool's structured result. */
export function describeFlowResult(structuredContent: unknown): FlowResultDetails {
  if (!isRecord(structuredContent)) return {};

  const details: FlowResultDetails = { flowStatus: stringOrUndefined(structuredContent.status) };

  if (typeof structuredContent.field === 'string') {
    details.askedFields = [structuredContent.field];
  } else if (Array.isArray(structuredContent.questions)) {
    details.askedFields = structuredContent.questions
      .map((question) => (isRecord(question) ? stringOrUndefined(question.field) : undefined))
      .filter((field): field is string => field !== undefined);
  }

  return details;
}
