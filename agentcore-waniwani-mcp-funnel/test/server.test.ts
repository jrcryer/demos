import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MemoryKvStore } from '@waniwani/sdk/mcp';
import { createHttpServer } from '../src/mcp-server/server';
import type { LeadCapturedDetail } from '../src/shared/lead';

/** Exercises the HTTP contract AgentCore Runtime relies on, over a real socket. */
describe('MCP HTTP server', () => {
  let server: Server;
  let baseUrl: string;
  const leads: LeadCapturedDetail[] = [];

  beforeAll(async () => {
    server = createHttpServer({
      store: new MemoryKvStore(),
      publishLead: async (lead) => {
        leads.push(lead);
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function rpc(method: string, params: unknown, sessionId?: string) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const text = await response.text();
    const data = text.split('\n').find((line) => line.startsWith('data: '));
    return JSON.parse(data ? data.slice('data: '.length) : text);
  }

  const callFlow = (args: Record<string, unknown>, sessionId: string) =>
    rpc('tools/call', { name: 'solar_quote', arguments: args }, sessionId).then(
      (message) => message.result.structuredContent,
    );

  it('answers the health check', async () => {
    const response = await fetch(`${baseUrl}/ping`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'Healthy' });
  });

  it('lists the flow and its result tool', async () => {
    const message = await rpc('tools/list', {});

    expect(message.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'show_solar_quote_result',
      'solar_quote',
    ]);
  });

  it('accepts the Mcp-Session-Id header without having issued it', async () => {
    const message = await rpc(
      'initialize',
      { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      'session-from-agentcore',
    );

    expect(message.result.serverInfo.name).toBe('solar-quote-funnel');
  });

  it('keeps flow state per session across independent requests', async () => {
    await callFlow({ action: 'start', intent: 'quote' }, 'session-a');
    await callFlow({ action: 'start', intent: 'quote' }, 'session-b');

    const a = await callFlow(
      { action: 'continue', stateUpdates: { propertyType: 'house' } },
      'session-a',
    );
    const b = await callFlow(
      { action: 'continue', stateUpdates: { propertyType: 'apartment' } },
      'session-b',
    );

    expect(a).toMatchObject({ status: 'interrupt', field: 'monthlyBillUsd' });
    expect(b).toMatchObject({ status: 'widget', data: { outcome: 'not_eligible' } });
  });

  it('completes a funnel and renders the result', async () => {
    const session = 'session-complete';
    const result = await callFlow(
      {
        action: 'start',
        intent: 'quote',
        stateUpdates: {
          propertyType: 'house',
          monthlyBillUsd: 180,
          name: 'Ada',
          email: 'ada@example.com',
        },
      },
      session,
    );
    expect(result).toMatchObject({ status: 'widget', tool: 'show_solar_quote_result' });

    const shown = await rpc(
      'tools/call',
      { name: 'show_solar_quote_result', arguments: result.data },
      session,
    );
    expect(shown.result.content[0].text).toContain('8.5 kW system for about $23,800');

    await expect(callFlow({ action: 'continue' }, session)).resolves.toMatchObject({
      status: 'complete',
    });
    expect(leads.filter((lead) => lead.email === 'ada@example.com')).toHaveLength(1);
  });

  it('rejects methods other than POST on /mcp', async () => {
    const response = await fetch(`${baseUrl}/mcp`);

    expect(response.status).toBe(405);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await fetch(`${baseUrl}/mcp`, { method: 'POST', body: '{nope' });

    expect(response.status).toBe(400);
  });
});
