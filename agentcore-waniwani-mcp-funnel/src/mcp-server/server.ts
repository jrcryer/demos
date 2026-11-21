import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { withWaniwani } from '@waniwani/sdk/mcp';
import { createQuoteFlow } from './flow';
import type { QuoteFlowDependencies } from './flow';
import { consoleRequestLogger, describeFlowResult, describeRequest } from './request-log';
import type { RequestLogEntry, RequestLogger } from './request-log';
import { registerResultTool } from './result-tool';

export const SERVER_NAME = 'solar-quote-funnel';
export const SERVER_VERSION = '0.1.0';

const MAX_BODY_BYTES = 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * The AgentCore Runtime MCP contract: stateless Streamable HTTP on `/mcp`,
 * plus `/ping` for health checks.
 *
 * Stateless means a fresh MCP server and transport per request, so any
 * instance can serve any call. Conversation state lives in the flow store,
 * keyed by the `Mcp-Session-Id` header AgentCore adds to each request.
 */
export function createHttpServer(
  dependencies: QuoteFlowDependencies,
  log: RequestLogger = consoleRequestLogger,
): Server {
  const flow = createQuoteFlow(dependencies);

  const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    const sessionHeader = req.headers['mcp-session-id'];
    const entry: Omit<RequestLogEntry, 'httpStatus' | 'durationMs'> = {
      message: 'mcp_request',
      sessionId: typeof sessionHeader === 'string' ? sessionHeader : undefined,
    };
    // Logged once the response is finished, whichever way the request ends.
    res.on('close', () => {
      log({ ...entry, httpStatus: res.statusCode, durationMs: Date.now() - startedAt });
    });

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJsonRpcError(res, 400, -32700, 'Parse error');
      return;
    }
    Object.assign(entry, describeRequest(body));

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    // A no-op without WANIWANI_API_KEY; with one it adds tracking.
    await withWaniwani(server, { injectWidgetToken: Boolean(process.env.WANIWANI_API_KEY) });
    // Same as `flow.register(server)`, with the handler wrapped so the log
    // line can say where the flow stopped.
    server.registerTool(flow.name, flow.config, async (args, extra) => {
      const result = await flow.handler(args, extra);
      Object.assign(entry, describeFlowResult(result.structuredContent));
      return result;
    });
    registerResultTool(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/ping' && req.method === 'GET') {
      sendJson(res, 200, { status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) });
      return;
    }

    if (path !== '/mcp') {
      sendJson(res, 404, { message: 'Not found' });
      return;
    }

    if (req.method !== 'POST') {
      // No server-initiated streams or session teardown in stateless mode.
      res.setHeader('allow', 'POST');
      sendJsonRpcError(res, 405, -32000, 'Method not allowed');
      return;
    }

    handleMcp(req, res).catch((error: unknown) => {
      console.error(JSON.stringify({ message: 'MCP request failed', error: String(error) }));
      if (!res.headersSent) sendJsonRpcError(res, 500, -32603, 'Internal server error');
      else res.end();
    });
  });
}
