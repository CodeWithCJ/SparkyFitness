import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabase } from '../utils/initializeDatabase.js';

const { client, connect, migrate, applyPolicies } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
  connect: vi.fn(),
  migrate: vi.fn(),
  applyPolicies: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({ getSystemClient: connect }));
vi.mock('../utils/dbMigrations.js', () => ({ applyMigrations: migrate }));
vi.mock('../utils/applyRlsPolicies.js', () => ({
  applyRlsPolicies: applyPolicies,
}));

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
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_lock(hashtext($1))',
      ['sparkyfitness:schema-initialization']
    );
    expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
    expect(applyPolicies).toHaveBeenCalledExactlyOnceWith(client);
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['sparkyfitness:schema-initialization']
    );
    expect(client.release).toHaveBeenCalledExactlyOnceWith(false);

    expect(client.query.mock.invocationCallOrder[0]).toBeLessThan(
      migrate.mock.invocationCallOrder[0]!
    );
    expect(migrate.mock.invocationCallOrder[0]).toBeLessThan(
      applyPolicies.mock.invocationCallOrder[0]!
    );
    expect(applyPolicies.mock.invocationCallOrder[0]).toBeLessThan(
      client.query.mock.invocationCallOrder[1]!
    );
    expect(client.query.mock.invocationCallOrder[1]).toBeLessThan(
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
    client.query.mockImplementationOnce(() => {
      markLockRequested();
      return lock;
    });

    const initialization = initializeDatabase();
    try {
      await lockRequested;

      expect(migrate).not.toHaveBeenCalled();
      expect(applyPolicies).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledTimes(1);
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
    { stage: 'lock', queries: 1, migrations: 0, policies: 0 },
    { stage: 'migrations', queries: 1, migrations: 1, policies: 0 },
    { stage: 'policies', queries: 1, migrations: 1, policies: 1 },
    { stage: 'unlock', queries: 2, migrations: 1, policies: 1 },
  ])(
    'stops and discards the connection when $stage fails',
    async ({ stage, queries, migrations, policies }) => {
      const error = new Error(`${stage} failed`);
      if (stage === 'lock') {
        client.query.mockRejectedValueOnce(error);
      } else if (stage === 'migrations') {
        migrate.mockRejectedValueOnce(error);
      } else if (stage === 'policies') {
        applyPolicies.mockRejectedValueOnce(error);
      } else {
        client.query
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
        .mockResolvedValueOnce({ rows });

      await expect(initializeDatabase()).rejects.toThrow(
        'Failed to release the schema initialization lock.'
      );

      expect(client.query).toHaveBeenCalledTimes(2);
      expect(migrate).toHaveBeenCalledExactlyOnceWith(client);
      expect(applyPolicies).toHaveBeenCalledExactlyOnceWith(client);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    }
  );
});
