import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSystemClient } from '../db/poolManager.js';
import { grantPermissions } from '../db/grantPermissions.js';
import { applyMigrations } from '../utils/dbMigrations.js';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
}));

vi.mock('../db/grantPermissions.js', () => ({
  grantPermissions: vi.fn(),
}));

const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../db/migrations'
);
const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();

type QueryResult = {
  rowCount?: number;
  rows?: unknown[];
};

type FakeClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

const allMigrationsAppliedResult = (): QueryResult => ({
  rows: migrationFiles.map((name) => ({ name })),
});

const createFakeClient = (
  queryImplementation: (sql: string) => Promise<QueryResult> | QueryResult
): FakeClient => ({
  query: vi.fn((sql: string) => queryImplementation(sql)),
  release: vi.fn(),
});

const originalAppUser = process.env.SPARKY_FITNESS_APP_DB_USER;
const originalAppPassword = process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
const originalDbHost = process.env.SPARKY_FITNESS_DB_HOST;
const originalDbProvider = process.env.SPARKY_FITNESS_DB_PROVIDER;

describe('applyMigrations advisory lock lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPARKY_FITNESS_APP_DB_USER = 'migration_test_app';
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = 'migration-test-password';
    delete process.env.SPARKY_FITNESS_DB_HOST;
    delete process.env.SPARKY_FITNESS_DB_PROVIDER;
  });

  afterEach(() => {
    if (originalAppUser === undefined) {
      delete process.env.SPARKY_FITNESS_APP_DB_USER;
    } else {
      process.env.SPARKY_FITNESS_APP_DB_USER = originalAppUser;
    }

    if (originalAppPassword === undefined) {
      delete process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
    } else {
      process.env.SPARKY_FITNESS_APP_DB_PASSWORD = originalAppPassword;
    }

    if (originalDbHost === undefined) {
      delete process.env.SPARKY_FITNESS_DB_HOST;
    } else {
      process.env.SPARKY_FITNESS_DB_HOST = originalDbHost;
    }

    if (originalDbProvider === undefined) {
      delete process.env.SPARKY_FITNESS_DB_PROVIDER;
    } else {
      process.env.SPARKY_FITNESS_DB_PROVIDER = originalDbProvider;
    }
  });

  it('unlocks the advisory lock and releases the client after success', async () => {
    const client = createFakeClient(async (sql) => {
      if (sql.includes('FROM pg_roles')) {
        return { rowCount: 1, rows: [{ exists: 1 }] };
      }
      if (sql.includes('SELECT name FROM system.schema_migrations')) {
        return allMigrationsAppliedResult();
      }
      return { rowCount: 1, rows: [] };
    });
    vi.mocked(getSystemClient).mockResolvedValue(client as never);
    vi.mocked(grantPermissions).mockResolvedValue(undefined);

    await applyMigrations();

    const queries = client.query.mock.calls.map(([sql]) => sql as string);
    expect(queries[0]).toBe('SELECT pg_advisory_lock($1)');
    expect(queries.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('unlocks the advisory lock and releases the client after a migration fails', async () => {
    const migrationFailure = new Error('migration statement failed');
    const failingMigration = migrationFiles[0];
    if (!failingMigration) {
      throw new Error('Expected at least one migration fixture.');
    }
    const failingSql = fs.readFileSync(
      path.join(migrationsDirectory, failingMigration),
      'utf8'
    );

    const client = createFakeClient(async (sql) => {
      if (sql.includes('FROM pg_roles')) {
        return { rowCount: 1, rows: [{ exists: 1 }] };
      }
      if (sql.includes('SELECT name FROM system.schema_migrations')) {
        return {
          rows: migrationFiles
            .filter((name) => name !== failingMigration)
            .map((name) => ({ name })),
        };
      }
      if (sql === failingSql) {
        throw migrationFailure;
      }
      return { rowCount: 1, rows: [] };
    });
    vi.mocked(getSystemClient).mockResolvedValue(client as never);

    await expect(applyMigrations()).rejects.toBe(migrationFailure);

    const queries = client.query.mock.calls.map(([sql]) => sql as string);
    expect(queries).toContain(failingSql);
    expect(queries.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(grantPermissions).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('serializes concurrent migration runners before either performs database work', async () => {
    let resolveFirstGrant: (() => void) | undefined;
    const firstGrantCanFinish = new Promise<void>((resolve) => {
      resolveFirstGrant = resolve;
    });
    let signalFirstGrantStarted: (() => void) | undefined;
    const firstGrantStarted = new Promise<void>((resolve) => {
      signalFirstGrantStarted = resolve;
    });
    let releaseSecondLock: (() => void) | undefined;
    const secondLockCanProceed = new Promise<void>((resolve) => {
      releaseSecondLock = resolve;
    });
    let signalSecondLockAttempted: (() => void) | undefined;
    const secondLockAttempted = new Promise<void>((resolve) => {
      signalSecondLockAttempted = resolve;
    });
    const events: string[] = [];

    const firstClient = createFakeClient(async (sql) => {
      if (sql === 'SELECT pg_advisory_lock($1)') {
        events.push('first:lock');
      } else if (sql === 'SELECT pg_advisory_unlock($1)') {
        events.push('first:unlock');
        releaseSecondLock?.();
      } else if (sql.includes('FROM pg_roles')) {
        events.push('first:work');
        return { rowCount: 1, rows: [{ exists: 1 }] };
      } else if (sql.includes('SELECT name FROM system.schema_migrations')) {
        return allMigrationsAppliedResult();
      }
      return { rowCount: 1, rows: [] };
    });
    const secondClient = createFakeClient(async (sql) => {
      if (sql === 'SELECT pg_advisory_lock($1)') {
        events.push('second:lock-attempt');
        signalSecondLockAttempted?.();
        await secondLockCanProceed;
        events.push('second:lock-acquired');
      } else if (sql === 'SELECT pg_advisory_unlock($1)') {
        events.push('second:unlock');
      } else if (sql.includes('FROM pg_roles')) {
        events.push('second:work');
        return { rowCount: 1, rows: [{ exists: 1 }] };
      } else if (sql.includes('SELECT name FROM system.schema_migrations')) {
        return allMigrationsAppliedResult();
      }
      return { rowCount: 1, rows: [] };
    });

    vi.mocked(getSystemClient)
      .mockResolvedValueOnce(firstClient as never)
      .mockResolvedValueOnce(secondClient as never);
    vi.mocked(grantPermissions)
      .mockImplementationOnce(async () => {
        signalFirstGrantStarted?.();
        await firstGrantCanFinish;
      })
      .mockResolvedValueOnce(undefined);

    const firstRun = applyMigrations();
    await firstGrantStarted;
    const secondRun = applyMigrations();
    await secondLockAttempted;

    expect(events).not.toContain('second:work');

    resolveFirstGrant?.();
    await Promise.all([firstRun, secondRun]);

    expect(events.indexOf('first:work')).toBeLessThan(
      events.indexOf('first:unlock')
    );
    expect(events.indexOf('first:unlock')).toBeLessThan(
      events.indexOf('second:work')
    );
    expect(firstClient.release).toHaveBeenCalledOnce();
    expect(secondClient.release).toHaveBeenCalledOnce();
  });
});
