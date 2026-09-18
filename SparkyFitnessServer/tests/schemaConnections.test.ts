import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { applyMigrations } from '../utils/dbMigrations.js';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';
import { grantPermissions } from '../db/grantPermissions.js';

const { borrowed, supplied, connect } = vi.hoisted(() => ({
  borrowed: { query: vi.fn(), release: vi.fn() },
  supplied: { query: vi.fn(), release: vi.fn() },
  connect: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({ getSystemClient: connect }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn(() => ['example.sql']),
    readFileSync: vi.fn(() => 'SELECT 1;'),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  connect.mockResolvedValue(borrowed);
  borrowed.query.mockResolvedValue({ rows: [], rowCount: 1 });
  supplied.query.mockResolvedValue({ rows: [], rowCount: 1 });
  vi.stubEnv('SPARKY_FITNESS_APP_DB_USER', 'test_app');
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('Process exited');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each([
  { name: 'migrations', run: applyMigrations, sql: 'SELECT 1;' },
  { name: 'RLS policies', run: applyRlsPolicies, sql: 'SELECT 1;' },
  {
    name: 'permissions',
    run: grantPermissions,
    sql: 'GRANT USAGE ON SCHEMA public TO "test_app"',
  },
])('$name connection ownership', ({ run, sql }) => {
  it('uses the supplied client without borrowing or releasing a client', async () => {
    await run(supplied as unknown as PoolClient);

    expect(supplied.query).toHaveBeenCalledWith(sql);
    expect(connect).not.toHaveBeenCalled();
    expect(borrowed.query).not.toHaveBeenCalled();
    expect(borrowed.release).not.toHaveBeenCalled();
    expect(supplied.release).not.toHaveBeenCalled();
  });

  it('borrows one client and releases it exactly once', async () => {
    await run();

    expect(borrowed.query).toHaveBeenCalledWith(sql);
    expect(connect).toHaveBeenCalledExactlyOnceWith();
    expect(borrowed.release).toHaveBeenCalledExactlyOnceWith();
  });

  it('preserves a query error without releasing the supplied client', async () => {
    const error = new Error('Query failed');
    supplied.query.mockRejectedValueOnce(error);

    await expect(run(supplied as unknown as PoolClient)).rejects.toBe(error);

    expect(connect).not.toHaveBeenCalled();
    expect(supplied.release).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('releases the borrowed client and preserves a query error', async () => {
    const error = new Error('Query failed');
    borrowed.query.mockRejectedValueOnce(error);

    await expect(run()).rejects.toBe(error);

    expect(connect).toHaveBeenCalledExactlyOnceWith();
    expect(borrowed.release).toHaveBeenCalledExactlyOnceWith();
    expect(process.exit).not.toHaveBeenCalled();
  });
});

describe('migration permissions', () => {
  it.each(['borrowed', 'supplied'] as const)(
    'propagates a grant failure on the %s migration client',
    async (ownership) => {
      const client = ownership === 'borrowed' ? borrowed : supplied;
      const error = new Error('Grant failed');
      client.query.mockImplementation(async (sql: string) => {
        if (sql.startsWith('GRANT ')) throw error;
        return { rows: [], rowCount: 1 };
      });

      await expect(
        applyMigrations(
          ownership === 'supplied' ? (client as unknown as PoolClient) : null
        )
      ).rejects.toBe(error);

      expect(client.query).toHaveBeenCalledWith('SELECT 1;');
      expect(client.query).toHaveBeenCalledWith(
        'GRANT USAGE ON SCHEMA public TO "test_app"'
      );
      expect(connect).toHaveBeenCalledTimes(ownership === 'borrowed' ? 1 : 0);
      expect(client.release).toHaveBeenCalledTimes(
        ownership === 'borrowed' ? 1 : 0
      );
      expect(process.exit).not.toHaveBeenCalled();
    }
  );
});
