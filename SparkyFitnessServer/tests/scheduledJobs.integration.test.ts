/**
 * The scheduled job claim against a migrated PostgreSQL: one winner per tick
 * among concurrent claimants, no claim of a tick already passed, and node-cron
 * tasks of the same job (as on two instances) running each tick once.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import scheduledJobRepository from '../models/scheduledJobRepository.js';
import { endPool } from '../db/poolManager.js';
import { scheduleJob } from '../services/scheduledJobs.js';

const PREFIX = `test-${randomUUID().slice(0, 8)}`;

function client(user = 'owner') {
  const app = user === 'app';
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: app
      ? process.env.SPARKY_FITNESS_APP_DB_USER
      : process.env.SPARKY_FITNESS_DB_USER,
    password: app
      ? process.env.SPARKY_FITNESS_APP_DB_PASSWORD
      : process.env.SPARKY_FITNESS_DB_PASSWORD,
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
      await probe.query('SELECT 1 FROM system.scheduled_jobs LIMIT 0');
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

describe.skipIf(!reachable)('scheduled job claims (PostgreSQL)', () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = client();
    await db.connect();
  });

  afterAll(async () => {
    await db.query('DELETE FROM system.scheduled_jobs WHERE name LIKE $1', [
      `${PREFIX}%`,
    ]);
    await db.end();
    await endPool();
  });

  it('lets exactly one of ten concurrent claimants run a tick', async () => {
    const slot = new Date('2026-11-01T03:00:00Z');
    const won = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        scheduledJobRepository.claimSlot(`${PREFIX}-race`, slot, `host:${i}`)
      )
    );

    expect(won.filter(Boolean)).toHaveLength(1);
    const { rows } = await db.query(
      'SELECT last_slot, claimed_by FROM system.scheduled_jobs WHERE name = $1',
      [`${PREFIX}-race`]
    );
    expect(rows).toEqual([
      { last_slot: slot, claimed_by: `host:${won.indexOf(true)}` },
    ]);
  });

  it('claims each later tick once and never a tick already passed', async () => {
    const name = `${PREFIX}-ticks`;
    const at = (hour: number) => new Date(Date.UTC(2026, 10, 1, hour));

    expect(await scheduledJobRepository.claimSlot(name, at(3), 'a:1')).toBe(
      true
    );
    expect(await scheduledJobRepository.claimSlot(name, at(3), 'b:2')).toBe(
      false
    );
    expect(await scheduledJobRepository.claimSlot(name, at(4), 'b:2')).toBe(
      true
    );
    // An instance whose clock lags computes the earlier tick late.
    expect(await scheduledJobRepository.claimSlot(name, at(3), 'c:3')).toBe(
      false
    );
  });

  it('is not readable by the app role', async () => {
    const app = client('app');
    await app.connect();
    try {
      await expect(
        app.query('SELECT 1 FROM system.scheduled_jobs')
      ).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });

  it('runs each tick of a job once when two instances schedule it', async () => {
    const name = `${PREFIX}-every-second`;
    const runs: string[] = [];
    // Two tasks of one job in one process stand in for two instances: each
    // asks the database for every tick, as a separate server would.
    const tasks = [1, 2].map((instance) =>
      scheduleJob(name, '* * * * * *', ({ date }) => {
        runs.push(`${date.toISOString()}@${instance}`);
      })
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    } finally {
      for (const task of tasks) task.destroy();
    }

    const ticks = runs.map((run) => run.split('@')[0]);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ticks).size).toBe(ticks.length);
  }, 10_000);
});
