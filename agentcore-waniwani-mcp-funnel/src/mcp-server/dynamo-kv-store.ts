import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { KvStore, KvStoreSetOptions } from '@waniwani/sdk/mcp';

export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface DynamoKvStoreOptions {
  readonly client: Pick<DynamoDBDocumentClient, 'send'>;
  readonly tableName: string;
  /** Applied when the SDK does not ask for a specific retention. */
  readonly defaultTtlSeconds?: number;
  readonly now?: () => number;
}

/**
 * WaniWani flow state in DynamoDB.
 *
 * One item per key: `pk` is the key the SDK hands us (derived from the session
 * id), `value` the flow state, `ttl` the epoch second DynamoDB may delete it at.
 */
export class DynamoKvStore<T = Record<string, unknown>> implements KvStore<T> {
  private readonly client: Pick<DynamoDBDocumentClient, 'send'>;
  private readonly tableName: string;
  private readonly defaultTtlSeconds: number;
  private readonly now: () => number;

  constructor(options: DynamoKvStoreOptions) {
    this.client = options.client;
    this.tableName = options.tableName;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.now = options.now ?? Date.now;
  }

  async get(key: string): Promise<T | null> {
    const { Item } = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: key }, ConsistentRead: true }),
    );
    if (!Item) return null;
    // DynamoDB deletes expired items lazily, so an expired one can still be read.
    if (typeof Item.ttl === 'number' && Item.ttl <= this.epochSeconds()) return null;
    return Item.value as T;
  }

  async set(key: string, value: T, options?: KvStoreSetOptions): Promise<void> {
    const ttlSeconds = options?.ttlSeconds ?? this.defaultTtlSeconds;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: key, value, ttl: this.epochSeconds() + ttlSeconds },
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: key } }));
  }

  private epochSeconds(): number {
    return Math.floor(this.now() / 1000);
  }
}
