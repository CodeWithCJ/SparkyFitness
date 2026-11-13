/**
 * How a migration file is applied and recorded against a real PostgreSQL.
 *
 * Runs in the existing test database and cleans up its prefixed fixture
 * tables and migration records before and after the tests.
 */

import pg from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationFile } from '../utils/dbMigrations.js';

function clientFor(database: string | undefined) {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = clientFor(process.env.SPARKY_FITNESS_DB_NAME);
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

describe.runIf(RUN)('migration transactions (real PostgreSQL)', () => {
  let client: pg.Client;

  const apply = (file: string, sql: string) =>
    applyMigrationFile(client as unknown as PoolClient, file, sql);
  const recorded = async (name: string) =>
    (
      await client.query(
        'SELECT 1 FROM system.schema_migrations WHERE name = $1',
        [name]
      )
    ).rowCount === 1;
  const tableExists = async (name: string) =>
    (
      await client.query<{ oid: string | null }>(
        'SELECT to_regclass($1) AS oid',
        [name]
      )
    ).rows[0]!.oid !== null;

  const activeQueries = async (marker: string) =>
    (
      await client.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND state = 'active' AND query LIKE '%' || $1 || '%' AND pid <> pg_backend_pid()",
        [marker]
      )
    ).rowCount ?? 0;

  const cleanup = async () => {
    await client.query(`
      DROP TABLE IF EXISTS migration_tx_plain_ok;
      DROP TABLE IF EXISTS migration_tx_plain_fail;
      DROP TABLE IF EXISTS migration_tx_killed;
      DROP TABLE IF EXISTS migration_tx_concurrent_target;
      DELETE FROM system.schema_migrations WHERE name LIKE 'migration_tx_%';
    `);
  };

  beforeAll(async () => {
    client = clientFor(process.env.SPARKY_FITNESS_DB_NAME);
    await client.connect();
    await cleanup();
  });

  afterAll(async () => {
    try {
      if (client) await cleanup();
    } finally {
      await client?.end().catch(() => {});
    }
  });

  it('applies and records a file', async () => {
    await apply(
      'migration_tx_plain_ok.sql',
      'CREATE TABLE migration_tx_plain_ok (id int);\n-- trailing comment'
    );

    expect(await tableExists('migration_tx_plain_ok')).toBe(true);
    expect(await recorded('migration_tx_plain_ok.sql')).toBe(true);
  });

  it('leaves neither changes nor a record when a file fails', async () => {
    await expect(
      apply(
        'migration_tx_plain_fail.sql',
        'CREATE TABLE migration_tx_plain_fail (id int);\nSELECT 1 / 0;'
      )
    ).rejects.toMatchObject({ code: '22012' });

    expect(await tableExists('migration_tx_plain_fail')).toBe(false);
    expect(await recorded('migration_tx_plain_fail.sql')).toBe(false);
    // A failed migration must not leave the session in an aborted transaction.
    await expect(client.query('SELECT 1')).resolves.toBeDefined();
  });

  it('records a migration whose server dies while it runs', async () => {
    // A process killed mid-migration (out of memory, a stop timeout) must not
    // leave the file applied but unrecorded, or the next boot runs it again.
    const dying = clientFor(process.env.SPARKY_FITNESS_DB_NAME);
    await dying.connect();
    dying.on('error', () => {});
    const pending = applyMigrationFile(
      dying as unknown as PoolClient,
      'migration_tx_killed.sql',
      'CREATE TABLE migration_tx_killed (id int);\nSELECT pg_sleep(1);'
    ).catch(() => {});
    await expect
      .poll(async () => (await activeQueries('migration_tx_killed')) > 0)
      .toBe(true);
    (
      dying as unknown as { connection: { stream: { destroy(): void } } }
    ).connection.stream.destroy();
    await pending;
    await expect
      .poll(async () => activeQueries('migration_tx_killed'), { timeout: 5000 })
      .toBe(0);

    expect(await tableExists('migration_tx_killed')).toBe(true);
    expect(await recorded('migration_tx_killed.sql')).toBe(true);
  });

  it('refuses CREATE INDEX CONCURRENTLY with the file name and leaves no record', async () => {
    await client.query('CREATE TABLE migration_tx_concurrent_target (id int)');

    await expect(
      apply(
        'migration_tx_concurrent.sql',
        'CREATE INDEX CONCURRENTLY migration_tx_concurrent_idx ON migration_tx_concurrent_target (id);'
      )
    ).rejects.toThrow(
      /^Migration migration_tx_concurrent\.sql contains a statement that cannot run inside a transaction block/
    );

    expect(await tableExists('migration_tx_concurrent_idx')).toBe(false);
    expect(await recorded('migration_tx_concurrent.sql')).toBe(false);
  });
});
