/**
 * Bulk food import status against a migrated PostgreSQL: one import per user
 * and kind across instances, progress readable from any connection, and an
 * import whose connection died read as failed rather than running forever.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endPool } from '../db/poolManager.js';
import { beginBulkImport, readBulkImport } from '../services/bulkImports.js';

const userId = randomUUID();

function client() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  const probe = client();
  try {
    try {
      await probe.connect();
    } catch {
      return false;
    }
    try {
      await probe.query('SELECT 1 FROM system.bulk_imports LIMIT 0');
      return true;
    } catch (error) {
      // CI always migrates its database, so a missing table there is a failure, not a skip.
      if (process.env.CI === 'true') throw error;
      return false;
    }
  } finally {
    await probe.end().catch(() => {});
  }
}

const reachable = await isDbReachable();

function running(processed = 0) {
  return { isRunning: true, status: 'running', processed };
}

describe.skipIf(!reachable)('bulk food imports (PostgreSQL)', () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = client();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `bulk-import-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('runs one import per user and kind, and shows its progress', async () => {
    const [first, second] = await Promise.all([
      beginBulkImport('cnf-test', userId, running()),
      beginBulkImport('cnf-test', userId, running()),
    ]);
    const job = first ?? second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    // Another kind is a separate import.
    const other = await beginBulkImport('slv-test', userId, running());
    expect(other).not.toBeNull();
    await other!.finish({
      isRunning: false,
      status: 'completed',
      processed: 0,
    });
    // Restartable as soon as finish() returns.
    const again = await beginBulkImport('slv-test', userId, running());
    expect(again).not.toBeNull();
    await again!.finish({
      isRunning: false,
      status: 'completed',
      processed: 0,
    });

    await job!.save(running(40));
    expect(await readBulkImport('cnf-test', userId)).toEqual(running(40));

    await job!.finish({ isRunning: false, status: 'completed', processed: 80 });
    expect(await readBulkImport('cnf-test', userId)).toMatchObject({
      status: 'completed',
      processed: 80,
    });
    const next = await beginBulkImport('cnf-test', userId, running());
    expect(next).not.toBeNull();
    await next!.finish({ isRunning: false, status: 'completed', processed: 0 });
  });

  it('reads an import whose server died as failed', async () => {
    await db.query(
      `INSERT INTO system.bulk_imports (user_id, kind, status)
       VALUES ($1, 'dead-test', $2)`,
      [userId, running(10)]
    );

    expect(await readBulkImport('dead-test', userId)).toMatchObject({
      isRunning: false,
      status: 'failed',
      processed: 10,
    });
    const restarted = await beginBulkImport('dead-test', userId, running());
    expect(restarted).not.toBeNull();
    await restarted!.finish({
      isRunning: false,
      status: 'completed',
      processed: 0,
    });
  });

  it('is not readable by the app role', async () => {
    const app = new pg.Client({
      host: process.env.SPARKY_FITNESS_DB_HOST,
      port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
      database: process.env.SPARKY_FITNESS_DB_NAME,
      user: process.env.SPARKY_FITNESS_APP_DB_USER,
      password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    });
    await app.connect();
    try {
      await expect(
        app.query('SELECT 1 FROM system.bulk_imports')
      ).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });
});
