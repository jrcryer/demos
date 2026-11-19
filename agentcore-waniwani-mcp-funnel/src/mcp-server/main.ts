import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { MemoryKvStore } from '@waniwani/sdk/mcp';
import { DynamoKvStore } from './dynamo-kv-store';
import type { FlowStore } from './flow';
import { eventBridgeLeadPublisher, loggingLeadPublisher } from './lead-publisher';
import type { LeadPublisher } from './lead-publisher';
import { createHttpServer } from './server';

// AgentCore Runtime routes MCP traffic to 0.0.0.0:8000.
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT ?? 8000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function createStore(): FlowStore {
  if (process.env.FLOW_STORE === 'memory') return new MemoryKvStore();

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new DynamoKvStore({ client, tableName: requireEnv('FLOW_STATE_TABLE_NAME') });
}

function createLeadPublisher(): LeadPublisher {
  if (process.env.LEAD_SINK === 'log') return loggingLeadPublisher;
  return eventBridgeLeadPublisher(new EventBridgeClient({}), requireEnv('EVENT_BUS_NAME'));
}

/**
 * Opt in to the hosted WaniWani Platform. The key is read from Secrets Manager
 * rather than a plain environment variable, and the SDK picks it up from
 * `process.env` when it first needs it.
 */
async function loadWaniwaniApiKey(): Promise<void> {
  const secretArn = process.env.WANIWANI_API_KEY_SECRET_ARN;
  if (!secretArn || process.env.WANIWANI_API_KEY) return;

  const { SecretString } = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!SecretString) throw new Error('The WaniWani API key secret has no string value');
  process.env.WANIWANI_API_KEY = SecretString;
}

async function main(): Promise<void> {
  await loadWaniwaniApiKey();

  const server = createHttpServer({ store: createStore(), publishLead: createLeadPublisher() });
  server.listen(PORT, HOST, () => {
    console.log(JSON.stringify({ message: 'MCP server listening', host: HOST, port: PORT }));
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ message: 'MCP server failed to start', error: String(error) }));
  process.exit(1);
});
