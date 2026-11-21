import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MemoryKvStore } from '@waniwani/sdk/mcp';
import { describeFlowResult, describeRequest } from '../src/mcp-server/request-log';
import type { RequestLogEntry } from '../src/mcp-server/request-log';
import { createHttpServer } from '../src/mcp-server/server';

describe('describeRequest', () => {
  it('names the fields a flow call answered, not their values', () => {
    const details = describeRequest({
      method: 'tools/call',
      params: {
        name: 'solar_quote',
        arguments: { action: 'continue', stateUpdates: { name: 'Ada', email: 'ada@example.com' } },
      },
    });

    expect(details).toEqual({
      method: 'tools/call',
      tool: 'solar_quote',
      flowAction: 'continue',
      answeredFields: ['name', 'email'],
    });
  });

  it('records the outcome when the result is shown', () => {
    const details = describeRequest({
      method: 'tools/call',
      params: { name: 'show_solar_quote_result', arguments: { outcome: 'quoted', quote: {} } },
    });

    expect(details).toEqual({
      method: 'tools/call',
      tool: 'show_solar_quote_result',
      outcome: 'quoted',
    });
  });

  it('records only the method for other requests', () => {
    expect(describeRequest({ method: 'tools/list' })).toEqual({ method: 'tools/list' });
  });

  it('tolerates batches and malformed bodies', () => {
    expect(describeRequest([{ method: 'tools/list' }])).toEqual({ method: 'batch' });
    expect(describeRequest('nope')).toEqual({});
    expect(describeRequest({ method: 'tools/call', params: 'nope' })).toEqual({
      method: 'tools/call',
    });
  });
});

describe('describeFlowResult', () => {
  it('reads a single question', () => {
    expect(describeFlowResult({ status: 'interrupt', field: 'propertyType' })).toEqual({
      flowStatus: 'interrupt',
      askedFields: ['propertyType'],
    });
  });

  it('reads several questions', () => {
    expect(
      describeFlowResult({
        status: 'interrupt',
        questions: [{ field: 'name' }, { field: 'email' }],
      }),
    ).toEqual({ flowStatus: 'interrupt', askedFields: ['name', 'email'] });
  });

  it('reads a step that asks nothing', () => {
    expect(describeFlowResult({ status: 'complete' })).toEqual({ flowStatus: 'complete' });
    expect(describeFlowResult(undefined)).toEqual({});
  });
});

describe('request logging over HTTP', () => {
  let server: Server;
  let baseUrl: string;
  const entries: RequestLogEntry[] = [];

  beforeAll(async () => {
    server = createHttpServer(
      { store: new MemoryKvStore(), publishLead: async () => undefined },
      (entry) => entries.push(entry),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    entries.length = 0;
  });

  async function post(body: string, sessionId?: string): Promise<void> {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body,
    });
    await response.text();
    // The entry is written when the server sees the response close, which can
    // land just after the client has finished reading it.
    for (let attempt = 0; attempt < 50 && entries.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const flowCall = (args: Record<string, unknown>) =>
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'solar_quote', arguments: args },
    });

  it('logs one line per flow call with the step reached', async () => {
    await post(
      flowCall({
        action: 'start',
        intent: 'quote',
        stateUpdates: { propertyType: 'house', monthlyBillUsd: 180 },
      }),
      'session-log-1',
    );

    expect(entries).toEqual([
      {
        message: 'mcp_request',
        sessionId: 'session-log-1',
        method: 'tools/call',
        tool: 'solar_quote',
        flowAction: 'start',
        answeredFields: ['propertyType', 'monthlyBillUsd'],
        flowStatus: 'interrupt',
        askedFields: ['name', 'email'],
        httpStatus: 200,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('keeps the answers themselves out of the log', async () => {
    await post(
      flowCall({
        action: 'start',
        intent: 'quote',
        stateUpdates: {
          propertyType: 'house',
          monthlyBillUsd: 180,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      }),
      'session-log-2',
    );

    const logged = JSON.stringify(entries);
    expect(entries).toHaveLength(1);
    expect(logged).not.toContain('Ada Lovelace');
    expect(logged).not.toContain('ada@example.com');
  });

  it('logs a request that could not be parsed', async () => {
    await post('{nope');

    expect(entries).toEqual([
      { message: 'mcp_request', httpStatus: 400, durationMs: expect.any(Number) },
    ]);
  });
});
