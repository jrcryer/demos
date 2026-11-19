import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_TTL_SECONDS, DynamoKvStore } from '../src/mcp-server/dynamo-kv-store';

const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

function setup(getResult: { Item?: Record<string, unknown> } = {}) {
  const send = jest.fn().mockResolvedValue(getResult);
  const store = new DynamoKvStore<{ step: string }>({
    client: { send },
    tableName: 'flow-state',
    now: () => NOW_MS,
  });
  return { send, store };
}

describe('DynamoKvStore', () => {
  it('returns null when there is no item', async () => {
    const { store, send } = setup();

    await expect(store.get('session-1')).resolves.toBeNull();

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: 'flow-state',
      Key: { pk: 'session-1' },
      ConsistentRead: true,
    });
  });

  it('returns the stored value', async () => {
    const { store } = setup({ Item: { pk: 's', value: { step: 'ask' }, ttl: NOW_SECONDS + 60 } });

    await expect(store.get('s')).resolves.toEqual({ step: 'ask' });
  });

  it('treats an expired item DynamoDB has not deleted yet as missing', async () => {
    const { store } = setup({ Item: { pk: 's', value: { step: 'ask' }, ttl: NOW_SECONDS - 1 } });

    await expect(store.get('s')).resolves.toBeNull();
  });

  it('writes the value with the default TTL', async () => {
    const { store, send } = setup();

    await store.set('s', { step: 'ask' });

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual({
      TableName: 'flow-state',
      Item: { pk: 's', value: { step: 'ask' }, ttl: NOW_SECONDS + DEFAULT_TTL_SECONDS },
    });
  });

  it('honours the TTL the SDK asks for', async () => {
    const { store, send } = setup();

    await store.set('s', { step: 'ask' }, { ttlSeconds: 90 });

    expect(send.mock.calls[0][0].input.Item.ttl).toBe(NOW_SECONDS + 90);
  });

  it('deletes by key', async () => {
    const { store, send } = setup();

    await store.delete('s');

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input).toEqual({ TableName: 'flow-state', Key: { pk: 's' } });
  });
});
