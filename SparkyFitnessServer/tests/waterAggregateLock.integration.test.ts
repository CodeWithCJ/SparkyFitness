/**
 * The daily water total is rebuilt from the drinks ledger under a lock on its
 * user, day and source. Two things must hold against a real database:
 *
 * - two spellings of one day ('2026-09-05' and '2026-09-05 00:00:00', the same
 *   DATE to PostgreSQL) share one lock, so a rebuild waits for the other;
 * - transactions that rebuild several days take their locks in one fixed
 *   order, so batches touching the same days in opposite order never deadlock.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import measurementRepository from '../models/measurementRepository.js';

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

async function waitForBlockedAdvisoryLock(db: pg.Client) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await db.query(
      "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
    );
    if (waiting.rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The rebuild never waited for the lock.');
}

describe.runIf(RUN)('the water total lock', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const waterTotal = async (day: string, source: string) =>
    Number(
      (
        await db.query(
          `SELECT water_ml FROM public.water_intake
           WHERE user_id = $1 AND entry_date = $2 AND source = $3`,
          [userId, day, source]
        )
      ).rows[0]?.water_ml ?? 0
    );

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `water-lock-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('makes a rebuild wait for another that names the same day another way', async () => {
    const holder = ownerClient();
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await measurementRepository.lockWaterAggregates(
        holder as unknown as pg.PoolClient,
        userId,
        [{ entryDate: '2026-09-05', source: 'manual' }]
      );
      // A drink the holder has written but not committed: the waiting rebuild
      // must count it, so it may not read the ledger before the holder ends.
      await holder.query(
        `INSERT INTO public.water_intake_entries
           (user_id, entry_date, water_ml, source, created_by_user_id)
         VALUES ($1, '2026-09-05', 300, 'manual', $1)`,
        [userId]
      );

      let finished = false;
      const rebuild = measurementRepository
        .recomputeWaterAggregateForUser(
          userId,
          userId,
          '2026-09-05 00:00:00',
          'manual'
        )
        .then((total) => {
          finished = true;
          return total;
        });
      await waitForBlockedAdvisoryLock(db);
      expect(finished).toBe(false);

      await holder.query('COMMIT');
      expect(await rebuild).toBe(300);
      expect(await waterTotal('2026-09-05', 'manual')).toBe(300);
    } finally {
      await holder.end().catch(() => {});
    }
  });

  it('lets batches that touch the same days in opposite order finish', async () => {
    const batch = (round: number, days: string[]) =>
      measurementRepository.upsertWaterIntakeSamples(
        userId,
        userId,
        days.map((entryDate, index) => ({
          entryDate,
          waterMl: 100,
          containerName: 'Glass',
          source: 'HealthKit',
          sourceId: `round-${round}-${days.join('+')}-${index}`,
        }))
      );
    const days = ['2026-09-10', '2026-09-11', '2026-09-12'];
    for (let round = 0; round < 15; round++) {
      const results = await Promise.allSettled([
        batch(round, days),
        batch(round, [...days].reverse()),
        batch(round, [days[1], days[2], days[0]]),
        batch(round, [days[2], days[0], days[1]]),
      ]);
      expect(results.filter((result) => result.status === 'rejected')).toEqual(
        []
      );
    }
    // Every drink is counted in its day's total.
    const ledger = await db.query(
      `SELECT entry_date::text AS day, SUM(water_ml)::float AS ml
       FROM public.water_intake_entries
       WHERE user_id = $1 AND source = 'HealthKit' GROUP BY entry_date`,
      [userId]
    );
    for (const row of ledger.rows as Array<{ day: string; ml: number }>) {
      expect(await waterTotal(row.day, 'HealthKit')).toBe(row.ml);
    }
  });

  it('lets a delete and a batch over the same days in opposite order finish', async () => {
    const days = ['2026-09-20', '2026-09-21'];
    const seed = (tag: string) =>
      measurementRepository.upsertWaterIntakeSamples(
        userId,
        userId,
        days.map((entryDate, index) => ({
          entryDate,
          waterMl: 50,
          containerName: 'Cup',
          source: 'Fitbit',
          sourceId: `${tag}-${index}`,
        }))
      );
    for (let round = 0; round < 15; round++) {
      await seed(`seed-${round}`);
      const results = await Promise.allSettled([
        measurementRepository.deleteWaterIntakeSamplesBySourceIds(
          userId,
          userId,
          'Fitbit',
          [`seed-${round}-0`, `seed-${round}-1`]
        ),
        measurementRepository.upsertWaterIntakeSamples(
          userId,
          userId,
          [...days].reverse().map((entryDate, index) => ({
            entryDate,
            waterMl: 25,
            containerName: 'Cup',
            source: 'Fitbit',
            sourceId: `late-${round}-${index}`,
          }))
        ),
      ]);
      expect(results.filter((result) => result.status === 'rejected')).toEqual(
        []
      );
    }
  });

  it('lets two moves of a linked drink in opposite directions, each locking both days before writing, finish', async () => {
    const [d1, d2] = ['2026-09-30', '2026-10-01'];
    const move = async (from: string, to: string, rowId: string) => {
      const client = ownerClient();
      await client.connect();
      try {
        await client.query('BEGIN');
        // The same order of work as the linked-food update: both days first,
        // then the ledger row, then the rebuilds.
        await measurementRepository.lockWaterAggregates(
          client as unknown as pg.PoolClient,
          userId,
          [
            { entryDate: from, source: 'manual' },
            { entryDate: to, source: 'manual' },
          ]
        );
        await client.query(
          'UPDATE public.water_intake_entries SET entry_date = $1 WHERE id = $2',
          [to, rowId]
        );
        for (const day of [to, from]) {
          await measurementRepository.recomputeWaterAggregate(
            client as unknown as pg.PoolClient,
            userId,
            userId,
            day,
            'manual'
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        await client.end().catch(() => {});
      }
    };
    const insertRow = async (day: string) =>
      (
        await db.query(
          `INSERT INTO public.water_intake_entries
             (user_id, entry_date, water_ml, source, created_by_user_id)
           VALUES ($1, $2, 200, 'manual', $1) RETURNING id`,
          [userId, day]
        )
      ).rows[0].id as string;
    for (let round = 0; round < 15; round++) {
      const a = await insertRow(d1);
      const b = await insertRow(d2);
      const results = await Promise.allSettled([
        move(d1, d2, a),
        move(d2, d1, b),
      ]);
      expect(results.filter((result) => result.status === 'rejected')).toEqual(
        []
      );
    }
  });
});
