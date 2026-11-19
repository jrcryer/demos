/**
 * Walks the solar quote funnel against an MCP endpoint, the way a model would.
 *
 *   Local:     MCP_URL=http://localhost:8000/mcp npm run smoke
 *   Deployed:  RUNTIME_ARN=... TOKEN_ENDPOINT=... CLIENT_ID=... CLIENT_SECRET=... npm run smoke
 *
 * See the README for where the deployed values come from.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SCOPE = 'solar-quote/invoke';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** AgentCore Runtime's invocation URL takes the URL-encoded runtime ARN. */
function runtimeUrl(runtimeArn: string): string {
  const region = runtimeArn.split(':')[3];
  return (
    `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/` +
    `${encodeURIComponent(runtimeArn)}/invocations?qualifier=DEFAULT`
  );
}

async function fetchAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${requireEnv('CLIENT_ID')}:${requireEnv('CLIENT_SECRET')}`,
  ).toString('base64');

  const response = await fetch(requireEnv('TOKEN_ENDPOINT'), {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }),
  });
  if (!response.ok) throw new Error(`Token request failed with HTTP ${response.status}`);

  return ((await response.json()) as { access_token: string }).access_token;
}

async function main(): Promise<void> {
  const localUrl = process.env.MCP_URL;
  const url = localUrl ?? runtimeUrl(requireEnv('RUNTIME_ARN'));
  const headers: Record<string, string> = localUrl
    ? // Stands in for the session header AgentCore Runtime adds.
      { 'mcp-session-id': `smoke-${Date.now()}` }
    : { authorization: `Bearer ${await fetchAccessToken()}` };

  const client = new Client({ name: 'smoke-test', version: '0.1.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
  );

  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((tool) => tool.name).join(', ')}`);

  const flow = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: 'solar_quote', arguments: args });
    const step = result.structuredContent as Record<string, unknown>;
    const asked =
      step.field ?? (step.questions as { field: string }[] | undefined)?.map((q) => q.field);
    console.log(
      `-> ${JSON.stringify(args.stateUpdates ?? {})}\n<- ${step.status} ${asked ?? step.tool ?? ''}`,
    );
    return step;
  };

  await flow({ action: 'start', intent: 'Smoke test: wants an indicative solar quote' });
  await flow({ action: 'continue', stateUpdates: { propertyType: 'house' } });
  await flow({ action: 'continue', stateUpdates: { monthlyBillUsd: 180 } });
  const result = await flow({
    action: 'continue',
    stateUpdates: { name: 'Smoke Test', email: 'smoke-test@example.com' },
  });

  if (result.status !== 'widget') throw new Error(`Expected the result step, got ${result.status}`);

  const shown = await client.callTool({
    name: result.tool as string,
    arguments: result.data as Record<string, unknown>,
  });
  console.log((shown.content as { text: string }[])[0].text);

  const done = await flow({ action: 'continue' });
  if (done.status !== 'complete') throw new Error(`Expected completion, got ${done.status}`);

  await client.close();
  console.log('Smoke test passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
