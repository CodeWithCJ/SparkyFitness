/**
 * Demo seed, reset and purge rebuild one shared account. Two server instances
 * doing so at once (both booting, or a demo login landing on one instance
 * during the midnight reset on another) must take turns: one account, one copy
 * of the sample data, and a credential that never disappears.
 *
 * Each "instance" is a fresh module graph (its own pools and its own in-process
 * seed promise), so nothing in one process can serialize them.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

function ownerClient() {
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
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
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

type Instance = {
  demo: typeof import('../services/demoSeedService.js');
  endPool: () => Promise<void>;
};

async function startInstance(): Promise<Instance> {
  vi.resetModules();
  const pool = await import('../db/poolManager.js');
  const demo = await import('../services/demoSeedService.js');
  return { demo, endPool: pool.endPool };
}

describe.runIf(RUN)('demo account across server instances', () => {
  const email = `demo-${randomUUID()}@race.test`;
  let db: pg.Client;
  let instances: Instance[] = [];

  const users = async () =>
    (
      await db.query<{ id: string }>(
        'SELECT id FROM "user" WHERE LOWER(email) = $1',
        [email]
      )
    ).rows;

  // Row counts the seed's sample data produces for the account.
  const sampleData = async (userId: string) => {
    const { rows } = await db.query<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM food_entries WHERE user_id = $1) AS food_entries,
         (SELECT count(*)::int FROM exercise_entries WHERE user_id = $1) AS exercise_entries,
         (SELECT count(*)::int FROM foods WHERE user_id = $1) AS foods,
         (SELECT count(*)::int FROM sleep_entries WHERE user_id = $1) AS sleep_entries,
         (SELECT count(*)::int FROM check_in_measurements WHERE user_id = $1) AS check_ins,
         (SELECT count(*)::int FROM "account"
            WHERE user_id = $1 AND provider_id = 'credential') AS credentials`,
      [userId]
    );
    return rows[0];
  };

  beforeAll(async () => {
    vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'true');
    vi.stubEnv('SPARKY_FITNESS_DEMO_EMAIL', email);
    vi.stubEnv('SPARKY_FITNESS_DEMO_PASSWORD', 'race-demo-password-1A!');
    db = ownerClient();
    await db.connect();
    instances = [await startInstance(), await startInstance()];
  });

  afterAll(async () => {
    await db?.query('DELETE FROM "user" WHERE LOWER(email) = $1', [email]);
    await db?.end().catch(() => {});
    for (const instance of instances) await instance.endPool();
    vi.unstubAllEnvs();
  });

  it('creates one demo account when two instances seed at once', async () => {
    const [a, b] = instances;
    const results = await Promise.allSettled([
      a.demo.seedDemoUser(),
      b.demo.seedDemoUser(),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const ids = results.map((r) => (r as PromiseFulfilledResult<string>).value);
    const rows = await users();
    expect(rows).toHaveLength(1);
    expect(ids).toEqual([rows[0].id, rows[0].id]);

    const counts = await sampleData(rows[0].id);
    expect(counts.credentials).toBe(1);
    expect(counts.food_entries).toBeGreaterThan(0);
  });

  it('keeps one copy of the data and the credential when a reset and a re-sync overlap', async () => {
    const [a, b] = instances;
    const [{ id }] = await users();
    const expected = await sampleData(id);

    // Logins only need the account and its credential row; poll them all
    // the way through the overlap.
    let polling = true;
    const missing: number[] = [];
    const poll = (async () => {
      const reader = ownerClient();
      await reader.connect();
      try {
        while (polling) {
          const { rows } = await reader.query(
            `SELECT count(*)::int AS n FROM "user" u
               JOIN "account" a ON a.user_id = u.id AND a.provider_id = 'credential'
              WHERE LOWER(u.email) = $1`,
            [email]
          );
          if (rows[0].n !== 1) missing.push(rows[0].n);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      } finally {
        await reader.end();
      }
    })();

    const results = await Promise.allSettled([
      a.demo.resetDemoUserData(),
      b.demo.seedDemoUser(),
      a.demo.resetDemoUserData(),
    ]);
    polling = false;
    await poll;

    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(await users()).toEqual([{ id }]);
    expect(await sampleData(id)).toEqual(expected);
    expect(missing).toEqual([]);
  });

  it('purges the account and its data when two instances purge at once', async () => {
    const [a, b] = instances;
    const [{ id }] = await users();
    const results = await Promise.allSettled([
      a.demo.purgeDemoUserIfExists(),
      b.demo.purgeDemoUserIfExists(),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await users()).toEqual([]);
    expect(await sampleData(id)).toEqual({
      food_entries: 0,
      exercise_entries: 0,
      foods: 0,
      sleep_entries: 0,
      check_ins: 0,
      credentials: 0,
    });
  });
});
