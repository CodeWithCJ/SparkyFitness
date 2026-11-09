import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actorUserIdFor,
  dbContextStorage,
  getClient,
  withFixedActor,
} from '../db/poolManager.js';

const { client, connect } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, connect: vi.fn().mockResolvedValue(client) };
});
vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<typeof import('pg')>();
  return {
    default: {
      ...original.default,
      Pool: class {
        connect = connect;
        on = vi.fn();
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  client.query.mockResolvedValue({ rows: [] });
});
afterEach(() => {
  dbContextStorage.disable();
});

describe('getClient', () => {
  it('discards the borrowed client and preserves a context query error', async () => {
    const error = new Error('Context initialization failed');
    client.query.mockRejectedValueOnce(error);

    await expect(getClient('owner')).rejects.toBe(error);

    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([
    [null, undefined, 'owner'],
    [null, 'delegate', 'delegate'],
    ['explicit', 'delegate', 'explicit'],
  ])(
    'initializes context with actor %s / %s',
    async (explicit, inherited, actor) => {
      const result = inherited
        ? await dbContextStorage.run({ authenticatedUserId: inherited }, () =>
            getClient('owner', explicit)
          )
        : await getClient('owner', explicit);

      expect(result).toBe(client);
      expect(client.query).toHaveBeenCalledExactlyOnceWith(
        'SELECT public.set_app_context($1, $2)',
        ['owner', actor]
      );
      expect(client.release).not.toHaveBeenCalled();
    }
  );

  it('ignores an explicit actor inside withFixedActor', async () => {
    await dbContextStorage.run({ authenticatedUserId: 'delegate' }, () =>
      withFixedActor('delegate', () => getClient('owner', 'owner'))
    );

    expect(client.query).toHaveBeenCalledExactlyOnceWith(
      'SELECT public.set_app_context($1, $2)',
      ['owner', 'delegate']
    );
  });

  it('fixes the actor in withFixedActor outside a request too', async () => {
    await withFixedActor('delegate', () => getClient('owner', 'owner'));

    expect(client.query).toHaveBeenCalledExactlyOnceWith(
      'SELECT public.set_app_context($1, $2)',
      ['owner', 'delegate']
    );
  });

  it('names the fixed actor as the one acting inside withFixedActor', () => {
    expect(withFixedActor('delegate', () => actorUserIdFor('owner'))).toBe(
      'delegate'
    );
  });

  it('names the account itself as the one acting otherwise', async () => {
    expect(actorUserIdFor('owner')).toBe('owner');
    await dbContextStorage.run({ authenticatedUserId: 'delegate' }, () =>
      expect(actorUserIdFor('owner')).toBe('owner')
    );
  });

  it('does not borrow a client without a user ID', async () => {
    await expect(getClient(null)).rejects.toThrow('userId is required');
    expect(connect).not.toHaveBeenCalled();
  });

  it('preserves a connection failure without releasing an unborrowed client', async () => {
    const error = new Error('Connection refused');
    connect.mockRejectedValueOnce(error);

    await expect(getClient('owner')).rejects.toBe(error);
    expect(client.release).not.toHaveBeenCalled();
  });
});
