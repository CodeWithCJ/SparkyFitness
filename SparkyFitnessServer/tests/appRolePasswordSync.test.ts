import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const connectMock = vi.fn();
const endMock = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => {
  class Client {
    connect = connectMock;
    end = endMock;
  }
  return { default: { Client }, Client };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({ getSystemClient: vi.fn() }));
vi.mock('../db/grantPermissions.js', () => ({
  grantPermissions: vi.fn().mockResolvedValue(undefined),
}));

import { applyMigrations } from '../utils/dbMigrations.js';

/** A client whose role-existence answer and ALTER behaviour the test controls. */
function makeClient(opts: { roleExists: boolean; alterError?: unknown }) {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM pg_roles')) {
      return { rowCount: opts.roleExists ? 1 : 0, rows: [] };
    }
    if (sql.startsWith('ALTER ROLE') && opts.alterError) {
      throw opts.alterError;
    }
    if (sql.includes('schema_migrations') && sql.includes('SELECT')) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  const escapeLiteral = (value: string) => `'${value}'`;
  return { client: { query, release: vi.fn(), escapeLiteral }, queries };
}

// Minted per run so no password-shaped literal sits in the source; see
// tests/appDbCredentials.test.ts for the reasoning.
const appPassword = () => `app-${crypto.randomBytes(8).toString('hex')}`;
let currentAppPassword = appPassword();

const sqlOf = (queries: string[], prefix: string) =>
  queries.filter((q) => q.trim().startsWith(prefix));

beforeEach(() => {
  vi.clearAllMocks();
  endMock.mockResolvedValue(undefined);
  process.env.SPARKY_FITNESS_APP_DB_USER = 'sparky_app';
  currentAppPassword = appPassword();
  process.env.SPARKY_FITNESS_APP_DB_PASSWORD = currentAppPassword;
  process.env.SPARKY_FITNESS_DB_USER = 'sparky';
  process.env.SPARKY_FITNESS_DB_HOST = 'localhost';
  process.env.SPARKY_FITNESS_DB_NAME = 'sparkyfitness_db';
});
afterEach(() => vi.clearAllMocks());

describe('application role password synchronisation', () => {
  it('creates the role when it does not exist, and never probes', async () => {
    const { client, queries } = makeClient({ roleExists: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyMigrations(client as any);
    expect(sqlOf(queries, 'CREATE ROLE')).toHaveLength(1);
    expect(sqlOf(queries, 'ALTER ROLE')).toHaveLength(0);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('leaves an existing role alone when the password still authenticates', async () => {
    // This is the externally-managed-database case: no ALTER is attempted, so
    // the owner does not need CREATEROLE.
    connectMock.mockResolvedValue(undefined);
    const { client, queries } = makeClient({ roleExists: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyMigrations(client as any);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(sqlOf(queries, 'ALTER ROLE')).toHaveLength(0);
    expect(sqlOf(queries, 'CREATE ROLE')).toHaveLength(0);
  });

  it('updates the password when the existing role no longer authenticates', async () => {
    connectMock.mockRejectedValue(
      Object.assign(new Error('password authentication failed'), {
        code: '28P01',
      })
    );
    const { client, queries } = makeClient({ roleExists: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyMigrations(client as any);
    const alters = sqlOf(queries, 'ALTER ROLE');
    expect(alters).toHaveLength(1);
    expect(alters[0]).toContain('"sparky_app"');
    expect(alters[0]).toContain(`'${currentAppPassword}'`);
  });

  it('gives an actionable error when the owner lacks CREATEROLE', async () => {
    connectMock.mockRejectedValue(
      Object.assign(new Error('auth failed'), { code: '28P01' })
    );
    const { client } = makeClient({
      roleExists: true,
      alterError: Object.assign(new Error('permission denied'), {
        code: '42501',
      }),
    });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyMigrations(client as any)
    ).rejects.toThrow(/lacks CREATEROLE/);
  });

  it('propagates a non-authentication probe failure instead of altering', async () => {
    // e.g. the database is unreachable. Treating this as a password mismatch
    // would issue a pointless ALTER ROLE and bury the real cause.
    connectMock.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      })
    );
    const { client, queries } = makeClient({ roleExists: true });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyMigrations(client as any)
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(sqlOf(queries, 'ALTER ROLE')).toHaveLength(0);
  });

  it('escapes a single quote in the password', async () => {
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = "pw'with'quotes";
    connectMock.mockRejectedValue(
      Object.assign(new Error('auth failed'), { code: '28P01' })
    );
    const { client, queries } = makeClient({ roleExists: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyMigrations(client as any);
    expect(sqlOf(queries, 'ALTER ROLE')[0]).toContain("'pw''with''quotes'");
  });
});
