import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pools } = vi.hoisted(() => ({
  pools: [] as Array<{
    options: { user?: string };
    connect: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('pg', () => {
  class Pool {
    options: Record<string, unknown>;
    connect = vi.fn();
    on = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      pools.push(this as never);
    }
  }
  const types = {
    setTypeParser: vi.fn(),
    builtins: { NUMERIC: 1700, DATE: 1082 },
  };
  return { default: { Pool, types } };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

process.env.SPARKY_FITNESS_DB_USER = 'owner_user';
process.env.SPARKY_FITNESS_APP_DB_USER = 'app_user';
const { getClient, getSystemClient } = await import('../db/poolManager.js');
(await import('../db/connectRetry.js')).enableRequestConnectRetry();
const [ownerPool, appPool] = pools;

const withCode = (code: string) =>
  Object.assign(new Error(`failed (${code})`), { code });

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
}

beforeEach(() => {
  ownerPool!.connect.mockReset();
  appPool!.connect.mockReset();
});

describe('getClient connect retry', () => {
  it('retries a refused connection and sets the RLS context once', async () => {
    const client = fakeClient();
    appPool!.connect
      .mockRejectedValueOnce(withCode('ECONNREFUSED'))
      .mockResolvedValueOnce(client);

    await expect(getClient('user-1', 'actor-1')).resolves.toBe(client);

    expect(appPool!.connect).toHaveBeenCalledTimes(2);
    expect(client.query).toHaveBeenCalledExactlyOnceWith(
      'SELECT public.set_app_context($1, $2)',
      ['user-1', 'actor-1']
    );
  });

  it('discards a pooled client whose connection died and takes a fresh one', async () => {
    const dead = fakeClient();
    dead.query.mockRejectedValueOnce(
      new Error('Connection terminated unexpectedly')
    );
    const fresh = fakeClient();
    appPool!.connect.mockResolvedValueOnce(dead).mockResolvedValueOnce(fresh);

    await expect(getClient('user-1')).resolves.toBe(fresh);

    expect(dead.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(fresh.release).not.toHaveBeenCalled();
  });

  it('does not retry a context error that is not a connection error', async () => {
    const client = fakeClient();
    const error = withCode('22P02');
    client.query.mockRejectedValueOnce(error);
    appPool!.connect.mockResolvedValueOnce(client);

    await expect(getClient('not-a-uuid')).rejects.toBe(error);

    expect(appPool!.connect).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("never replays the caller's statement", async () => {
    const client = fakeClient();
    appPool!.connect.mockResolvedValueOnce(client);

    const acquired = await getClient('user-1');
    client.query.mockRejectedValueOnce(withCode('57P01'));
    await expect(
      acquired.query('INSERT INTO t VALUES (1)')
    ).rejects.toMatchObject({ code: '57P01' });

    expect(appPool!.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});

describe('getSystemClient connect retry', () => {
  it('retries a database that is starting up', async () => {
    const client = fakeClient();
    ownerPool!.connect
      .mockRejectedValueOnce(withCode('57P03'))
      .mockResolvedValueOnce(client);

    await expect(getSystemClient()).resolves.toBe(client);
    expect(ownerPool!.connect).toHaveBeenCalledTimes(2);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('does not retry bad credentials', async () => {
    const error = withCode('28P01');
    ownerPool!.connect.mockRejectedValueOnce(error);

    await expect(getSystemClient()).rejects.toBe(error);
    expect(ownerPool!.connect).toHaveBeenCalledOnce();
  });
});
