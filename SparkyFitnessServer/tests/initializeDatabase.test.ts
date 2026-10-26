import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../utils/initializeDatabase.js';

const { client, connect, migrate, applyPolicies } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  connect: vi.fn(),
  migrate: vi.fn(),
  applyPolicies: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getRawOwnerPool: () => ({ connect }),
}));
vi.mock('../utils/dbMigrations.js', () => ({ applyMigrations: migrate }));
vi.mock('../utils/applyRlsPolicies.js', () => ({
  applyRlsPolicies: applyPolicies,
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const keepalives =
  'SET tcp_keepalives_idle = 30; SET tcp_keepalives_interval = 10; SET tcp_keepalives_count = 3';

beforeEach(() => {
  vi.resetAllMocks();
  connect.mockResolvedValue(client);
  client.query.mockResolvedValue({ rows: [{ unlocked: true }] });
  migrate.mockResolvedValue(undefined);
  applyPolicies.mockResolvedValue(undefined);
});

describe('database initialization', () => {
  it('initializes on the lock connection and unlocks before returning it', async () => {
    await initializeDatabase();

    expect(connect).toHaveBeenCalledExactlyOnceWith();
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query).toHaveBeenNthCalledWith(1, keepalives);
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_lock(hashtext($1))',
      ['sparkyfitness:schema-initialization']
    );
    expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
    expect(applyPolicies).toHaveBeenCalledExactlyOnceWith(client);
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['sparkyfitness:schema-initialization']
    );
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);

    expect(client.query.mock.invocationCallOrder[1]).toBeLessThan(
      migrate.mock.invocationCallOrder[0]!
    );
    expect(migrate.mock.invocationCallOrder[0]).toBeLessThan(
      applyPolicies.mock.invocationCallOrder[0]!
    );
    expect(applyPolicies.mock.invocationCallOrder[0]).toBeLessThan(
      client.query.mock.invocationCallOrder[2]!
    );
    expect(client.query.mock.invocationCallOrder[2]).toBeLessThan(
      client.release.mock.invocationCallOrder[0]!
    );
  });

  it('waits for the lock before starting schema work', async () => {
    let grantLock!: () => void;
    const lock = new Promise<void>((resolve) => {
      grantLock = resolve;
    });
    let markLockRequested!: () => void;
    const lockRequested = new Promise<void>((resolve) => {
      markLockRequested = resolve;
    });
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce(() => {
        markLockRequested();
        return lock;
      });

    const initialization = initializeDatabase();
    try {
      await lockRequested;

      expect(migrate).not.toHaveBeenCalled();
      expect(applyPolicies).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledTimes(2);
      expect(client.release).not.toHaveBeenCalled();
    } finally {
      grantLock();
      await initialization;
    }

    expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
    expect(applyPolicies).toHaveBeenCalledExactlyOnceWith(client);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('preserves a connection error without attempting schema work or cleanup', async () => {
    const error = new Error('Connection failed');
    connect.mockRejectedValueOnce(error);

    await expect(initializeDatabase()).rejects.toBe(error);

    expect(connect).toHaveBeenCalledExactlyOnceWith();
    expect(client.query).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(applyPolicies).not.toHaveBeenCalled();
    expect(client.release).not.toHaveBeenCalled();
  });

  it.each([
    { stage: 'keepalives', queries: 1, migrations: 0, policies: 0 },
    { stage: 'lock', queries: 2, migrations: 0, policies: 0 },
    { stage: 'migrations', queries: 2, migrations: 1, policies: 0 },
    { stage: 'policies', queries: 2, migrations: 1, policies: 1 },
    { stage: 'unlock', queries: 3, migrations: 1, policies: 1 },
  ])(
    'stops and discards the connection when $stage fails',
    async ({ stage, queries, migrations, policies }) => {
      const error = new Error(`${stage} failed`);
      if (stage === 'keepalives') {
        client.query.mockRejectedValueOnce(error);
      } else if (stage === 'lock') {
        client.query
          .mockResolvedValueOnce({ rows: [] })
          .mockRejectedValueOnce(error);
      } else if (stage === 'migrations') {
        migrate.mockRejectedValueOnce(error);
      } else if (stage === 'policies') {
        applyPolicies.mockRejectedValueOnce(error);
      } else {
        client.query
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockRejectedValueOnce(error);
      }

      await expect(initializeDatabase()).rejects.toBe(error);

      expect(connect).toHaveBeenCalledExactlyOnceWith();
      expect(client.query).toHaveBeenCalledTimes(queries);
      expect(migrate).toHaveBeenCalledTimes(migrations);
      expect(applyPolicies).toHaveBeenCalledTimes(policies);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    }
  );

  it.each([
    { result: 'false', rows: [{ unlocked: false }] },
    { result: 'no row', rows: [] },
  ])(
    'discards the connection when unlock returns $result',
    async ({ rows }) => {
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows });

      await expect(initializeDatabase()).rejects.toThrow(
        'Failed to release the schema initialization lock.'
      );

      expect(client.query).toHaveBeenCalledTimes(3);
      expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
      expect(applyPolicies).toHaveBeenCalledExactlyOnceWith(client);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    }
  );
});

const withCode = (code: string) =>
  Object.assign(new Error(`connect failed (${code})`), { code });

describe('waiting for the database at startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries connection errors until the database accepts the connection', async () => {
    connect
      .mockRejectedValueOnce(withCode('ECONNREFUSED'))
      .mockRejectedValueOnce(withCode('57P03'))
      .mockResolvedValueOnce(client);

    const initialization = initializeDatabase();
    await vi.advanceTimersByTimeAsync(500);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(migrate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await initialization;

    expect(connect).toHaveBeenCalledTimes(3);
    expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('gives up with the last connection error after about a minute', async () => {
    const error = withCode('ECONNREFUSED');
    connect.mockRejectedValue(error);

    const started = Date.now();
    let failedAfterMs: number | undefined;
    const initialization = initializeDatabase().finally(() => {
      failedAfterMs = Date.now() - started;
    });
    const outcome = expect(initialization).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(120_000);
    await outcome;

    // Waits of 500, 1000, 2000 and 4000 ms, then 5000 ms until the next wait
    // would pass the 60 s window.
    expect(connect).toHaveBeenCalledTimes(15);
    expect(failedAfterMs).toBe(57_500);
    expect(migrate).not.toHaveBeenCalled();
    expect(client.release).not.toHaveBeenCalled();
  });

  it('fails at once on an error that retrying cannot fix', async () => {
    const error = withCode('28P01');
    connect.mockRejectedValueOnce(error);

    await expect(initializeDatabase()).rejects.toBe(error);

    expect(connect).toHaveBeenCalledExactlyOnceWith();
    expect(vi.getTimerCount()).toBe(0);
  });
});
