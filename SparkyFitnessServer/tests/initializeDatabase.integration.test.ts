import { readdirSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { endPool, getSystemClient } from '../db/poolManager.js';
import { initializeDatabase } from '../utils/initializeDatabase.js';

const RUN = process.env.RUN_DATABASE_INITIALIZATION_TEST === '1';
const lockName = 'sparkyfitness:schema-initialization';

describe.runIf(RUN)('database initialization integration', () => {
  beforeAll(() => {
    if (!process.env.SPARKY_FITNESS_DB_HOST) {
      throw new Error(
        'Database initialization tests require SPARKY_FITNESS_DB_HOST.'
      );
    }
    // Initialization changes the whole schema, not just isolated fixture rows.
    if (
      !/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? '')
    ) {
      throw new Error('Database initialization tests require a test database.');
    }
  });

  afterAll(async () => {
    await endPool();
  });

  it('waits for the schema lock, initializes and leaves no lock behind', async () => {
    const holder: PoolClient = await getSystemClient();
    let initialization: Promise<PromiseSettledResult<void>[]> | undefined;
    try {
      const { rows } = await holder.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid'
      );
      const holderPid = rows[0]!.pid;
      await holder.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);

      // Observe rejections immediately, even if checking the lock wait fails.
      initialization = Promise.allSettled([initializeDatabase()]);
      let initializerPid: number | undefined;
      await vi.waitFor(
        async () => {
          const waiting = await holder.query<{ pid: number }>(
            `SELECT pid FROM pg_locks
             WHERE locktype = 'advisory' AND NOT granted
               AND $1::int = ANY(pg_blocking_pids(pid))`,
            [holderPid]
          );
          expect(waiting.rows).toHaveLength(1);
          initializerPid = waiting.rows[0]!.pid;
        },
        { timeout: 3000, interval: 20 }
      );

      await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
      expect(await initialization).toEqual([
        { status: 'fulfilled', value: undefined },
      ]);

      const applied = await holder.query<{ name: string }>(
        'SELECT name FROM system.schema_migrations ORDER BY name'
      );
      const migrations = readdirSync(
        new URL('../db/migrations/', import.meta.url)
      )
        .filter((file) => file.endsWith('.sql'))
        .sort();
      expect(applied.rows.map((row) => row.name).sort()).toEqual(migrations);

      const remaining = await holder.query(
        `SELECT pid FROM pg_locks
         WHERE locktype = 'advisory' AND pid = ANY($1::int[])`,
        [[holderPid, initializerPid]]
      );
      expect(remaining.rows).toEqual([]);
    } finally {
      // Closing the holder also releases its lock if an assertion failed early.
      holder.release(true);
      await initialization;
    }
  });
});
