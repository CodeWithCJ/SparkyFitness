/**
 * The migration that kept one sleep entry per user, night and source (its
 * unique index is dropped again by the #3240 migration, which allows a nap its
 * own entry) and keeps one custom category per user and name, and the writes
 * that rely on it.
 *
 * Both suites run the whole migration, so they share this file: tests in one
 * file run in order, while separate files run in parallel and would clean up
 * each other's fixtures.
 *
 * Skipped unless a test database is reachable: the migration's cleanup is
 * unscoped, so fixture ids alone could not protect a normal database.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import measurementRepository from '../models/measurementRepository.js';
import sleepRepository from '../models/sleepRepository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  path.join(
    here,
    '../db/migrations/20261006180000_unique_sleep_entries_and_custom_categories.sql'
  ),
  'utf8'
);
const MULTIPLE_SLEEP_SESSIONS_SQL = readFileSync(
  path.join(
    here,
    '../db/migrations/20261028120000_allow_multiple_sleep_sessions_per_night.sql'
  ),
  'utf8'
);

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

afterAll(async () => {
  if (!RUN) return;
  // Both suites re-run the older migration, which recreates the unique sleep
  // index; leave the database as the current migrations do.
  const db = ownerClient();
  await db.connect();
  try {
    await db.query(MULTIPLE_SLEEP_SESSIONS_SQL);
  } finally {
    await db.end();
  }
  await endPool();
});

describe.runIf(RUN)('one sleep entry per night and source', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const insertEntry = async (
    entryDate: string,
    source: string,
    updatedAt: string,
    sleepScore: number
  ) =>
    (
      await db.query(
        `INSERT INTO public.sleep_entries
           (user_id, entry_date, bedtime, wake_time, duration_in_seconds,
            source, sleep_score, created_at, updated_at)
         VALUES ($1, $2, $2::date - interval '2 hours', $2::date + interval '6 hours',
                 28800, $3, $4, $5, $5)
         RETURNING id`,
        [userId, entryDate, source, sleepScore, updatedAt]
      )
    ).rows[0].id as string;

  const entriesFor = async (entryDate: string, source: string) =>
    (
      await db.query(
        `SELECT id, sleep_score FROM public.sleep_entries
         WHERE user_id = $1 AND entry_date = $2 AND source = $3`,
        [userId, entryDate, source]
      )
    ).rows;

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `sleep-unique-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
  });

  it('keeps the newest entry of a night and source, with its stages', async () => {
    // The test database is already migrated, so remove the index to recreate
    // the duplicates the migration has to clean up.
    await db.query(
      'DROP INDEX IF EXISTS public.sleep_entries_user_date_source_key'
    );
    const older = await insertEntry(
      '2026-09-01',
      'Withings',
      '2026-09-02T08:00:00Z',
      70
    );
    const newest = await insertEntry(
      '2026-09-01',
      'Withings',
      '2026-09-02T09:00:00Z',
      80
    );
    const otherSource = await insertEntry(
      '2026-09-01',
      'Fitbit',
      '2026-09-02T07:00:00Z',
      60
    );
    const otherNight = await insertEntry(
      '2026-09-02',
      'Withings',
      '2026-09-03T07:00:00Z',
      65
    );
    for (const entryId of [older, newest]) {
      await db.query(
        `INSERT INTO public.sleep_entry_stages
           (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds)
         VALUES ($1, $2, 'deep', '2026-09-01T01:00:00Z', '2026-09-01T02:00:00Z', 3600)`,
        [entryId, userId]
      );
    }

    await db.query(MIGRATION_SQL);

    expect(await entriesFor('2026-09-01', 'Withings')).toEqual([
      { id: newest, sleep_score: 80 },
    ]);
    expect((await entriesFor('2026-09-01', 'Fitbit'))[0].id).toBe(otherSource);
    expect((await entriesFor('2026-09-02', 'Withings'))[0].id).toBe(otherNight);
    const stages = await db.query(
      'SELECT entry_id FROM public.sleep_entry_stages WHERE user_id = $1',
      [userId]
    );
    expect(stages.rows).toEqual([{ entry_id: newest }]);
    await expect(
      insertEntry('2026-09-01', 'Withings', '2026-09-02T10:00:00Z', 90)
    ).rejects.toThrow(/sleep_entries_user_date_source_key/);

    await db.query(MULTIPLE_SLEEP_SESSIONS_SQL);
  });

  it('saves one entry when two writes for the same night overlap', async () => {
    const write = (sleepScore: number) =>
      sleepRepository.upsertSleepEntry(userId, userId, {
        entry_date: '2026-09-10',
        bedtime: '2026-09-09T22:00:00Z',
        wake_time: '2026-09-10T06:00:00Z',
        duration_in_seconds: 28800,
        sleep_score: sleepScore,
        source: 'Oura',
      });

    const [a, b] = await Promise.all([write(75), write(85)]);

    const rows = await entriesFor('2026-09-10', 'Oura');
    expect(rows).toHaveLength(1);
    expect(a.id).toBe(rows[0].id);
    expect(b.id).toBe(rows[0].id);
    expect([75, 85]).toContain(rows[0].sleep_score);
  });

  it('gives a nap its own entry and updates the night on a re-sync (#3240)', async () => {
    const write = (bedtime: string, wakeTime: string, sleepScore: number) =>
      sleepRepository.upsertSleepEntry(userId, userId, {
        entry_date: '2026-09-20',
        bedtime,
        wake_time: wakeTime,
        duration_in_seconds:
          (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000,
        sleep_score: sleepScore,
        source: 'HealthKit',
      });

    const night = await write(
      '2026-09-19T23:00:00Z',
      '2026-09-20T07:00:00Z',
      80
    );
    const [nap, napAgain] = await Promise.all([
      write('2026-09-20T13:30:00Z', '2026-09-20T14:15:00Z', 60),
      write('2026-09-20T13:30:00Z', '2026-09-20T14:15:00Z', 65),
    ]);
    // A later fragment of the night, within 4 hours of it.
    const fragment = await write(
      '2026-09-20T05:00:00Z',
      '2026-09-20T07:30:00Z',
      82
    );

    expect(night.created).toBe(true);
    expect(nap.id).not.toBe(night.id);
    expect(napAgain.id).toBe(nap.id);
    expect([nap.created, napAgain.created].sort()).toEqual([false, true]);
    expect(fragment).toMatchObject({ id: night.id, created: false });
    expect(await entriesFor('2026-09-20', 'HealthKit')).toHaveLength(2);
  });
});

describe.runIf(RUN)('one custom category per name', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const insertCategory = async (
    name: string,
    createdAt: string,
    displayName: string | null,
    unit = 'cm',
    frequency = 'Daily'
  ) =>
    (
      await db.query(
        `INSERT INTO public.custom_categories
           (user_id, name, display_name, measurement_type, frequency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id`,
        [userId, name, displayName, unit, frequency, createdAt]
      )
    ).rows[0].id as string;

  const insertMeasurement = (
    categoryId: string,
    entryDate: string,
    source = 'manual',
    entryHour: number | null = null
  ) =>
    db.query(
      `INSERT INTO public.custom_measurements
         (user_id, category_id, value, entry_date, source, entry_hour)
       VALUES ($1, $2, '80', $3, $4, $5)`,
      [userId, categoryId, entryDate, source, entryHour]
    );

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `category-unique-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [userId]
    );
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
  });

  it('merges same-definition duplicates and renames a different definition', async () => {
    // The test database is already migrated, so remove the index to recreate
    // the duplicates the migration has to merge.
    await db.query(
      'DROP INDEX IF EXISTS public.custom_categories_user_name_key'
    );
    const oldest = await insertCategory('Waist', '2026-09-01T00:00:00Z', null);
    const named = await insertCategory(
      'Waist',
      '2026-09-02T00:00:00Z',
      'Waist (cm)'
    );
    const newest = await insertCategory('Waist', '2026-09-03T00:00:00Z', null);
    const other = await insertCategory('Hips', '2026-09-01T00:00:00Z', null);
    const inches = await insertCategory(
      'Waist',
      '2026-09-02T12:00:00Z',
      null,
      'in'
    );
    await insertMeasurement(inches, '2026-09-05');
    await insertMeasurement(oldest, '2026-09-01');
    await insertMeasurement(named, '2026-09-02');
    await insertMeasurement(newest, '2026-09-03');
    await insertMeasurement(other, '2026-09-01');

    await db.query(MIGRATION_SQL);

    const categories = await db.query(
      `SELECT id, name, display_name FROM public.custom_categories
       WHERE user_id = $1 ORDER BY name`,
      [userId]
    );
    expect(categories.rows).toEqual([
      { id: other, name: 'Hips', display_name: null },
      { id: oldest, name: 'Waist', display_name: 'Waist (cm)' },
      { id: inches, name: 'Waist (2)', display_name: null },
    ]);
    const measurements = await db.query(
      `SELECT category_id, entry_date::text AS entry_date
       FROM public.custom_measurements WHERE user_id = $1
       ORDER BY category_id = $2, category_id = $3, entry_date`,
      [userId, other, inches]
    );
    expect(measurements.rows).toEqual([
      { category_id: oldest, entry_date: '2026-09-01' },
      { category_id: oldest, entry_date: '2026-09-02' },
      { category_id: oldest, entry_date: '2026-09-03' },
      { category_id: inches, entry_date: '2026-09-05' },
      { category_id: other, entry_date: '2026-09-01' },
    ]);
    await expect(
      insertCategory('Waist', '2026-09-04T00:00:00Z', null)
    ).rejects.toThrow(/custom_categories_user_name_key/);
  });

  it('keeps a duplicate whose readings would share a slot, and never moves them', async () => {
    await db.query(
      'DROP INDEX IF EXISTS public.custom_categories_user_name_key'
    );
    const steps = await insertCategory(
      'Steps',
      '2026-09-01T00:00:00Z',
      null,
      'steps'
    );
    const overlapping = await insertCategory(
      'Steps',
      '2026-09-02T00:00:00Z',
      null,
      'steps'
    );
    const separate = await insertCategory(
      'Steps',
      '2026-09-03T00:00:00Z',
      null,
      'steps'
    );
    await insertMeasurement(steps, '2026-09-10', 'Fitbit');
    await insertMeasurement(overlapping, '2026-09-10', 'Fitbit');
    await insertMeasurement(separate, '2026-09-11', 'Fitbit');
    const pulse = await insertCategory(
      'Pulse',
      '2026-09-01T00:00:00Z',
      null,
      'bpm',
      'Hourly'
    );
    const pulseLater = await insertCategory(
      'Pulse',
      '2026-09-02T00:00:00Z',
      null,
      'bpm',
      'Hourly'
    );
    await insertMeasurement(pulse, '2026-09-10', 'Fitbit', 8);
    await insertMeasurement(pulseLater, '2026-09-10', 'Fitbit', 9);

    await db.query(MIGRATION_SQL);

    const names = await db.query(
      `SELECT id, name FROM public.custom_categories
       WHERE id = ANY($1::uuid[])`,
      [[steps, overlapping, separate, pulse, pulseLater]]
    );
    expect(Object.fromEntries(names.rows.map((r) => [r.id, r.name]))).toEqual({
      [steps]: 'Steps',
      [overlapping]: 'Steps (2)',
      [pulse]: 'Pulse',
    });
    const readings = await db.query(
      `SELECT category_id, entry_date::text AS entry_date, entry_hour
       FROM public.custom_measurements
       WHERE category_id = ANY($1::uuid[])
       ORDER BY entry_date, entry_hour, category_id = $2`,
      [[steps, overlapping, pulse], steps]
    );
    expect(readings.rows).toEqual([
      { category_id: pulse, entry_date: '2026-09-10', entry_hour: 8 },
      { category_id: pulse, entry_date: '2026-09-10', entry_hour: 9 },
      { category_id: overlapping, entry_date: '2026-09-10', entry_hour: null },
      { category_id: steps, entry_date: '2026-09-10', entry_hour: null },
      { category_id: steps, entry_date: '2026-09-11', entry_hour: null },
    ]);
  });

  it('renames past a taken suffix and within the 50-character name limit', async () => {
    await db.query(
      'DROP INDEX IF EXISTS public.custom_categories_user_name_key'
    );
    const longName = 'L'.repeat(50);
    const neckCm = await insertCategory('Neck', '2026-09-01T00:00:00Z', null);
    const neckTaken = await insertCategory(
      'Neck (2)',
      '2026-09-01T00:00:00Z',
      null
    );
    const neckIn = await insertCategory(
      'Neck',
      '2026-09-02T00:00:00Z',
      null,
      'in'
    );
    const longCm = await insertCategory(longName, '2026-09-01T00:00:00Z', null);
    const longIn = await insertCategory(
      longName,
      '2026-09-02T00:00:00Z',
      null,
      'in'
    );

    await db.query(MIGRATION_SQL);

    const names = await db.query(
      `SELECT id, name FROM public.custom_categories
       WHERE id = ANY($1::uuid[]) ORDER BY name`,
      [[neckCm, neckTaken, neckIn, longCm, longIn]]
    );
    expect(Object.fromEntries(names.rows.map((r) => [r.id, r.name]))).toEqual({
      [neckCm]: 'Neck',
      [neckTaken]: 'Neck (2)',
      [neckIn]: 'Neck (3)',
      [longCm]: longName,
      [longIn]: `${'L'.repeat(46)} (2)`,
    });
  });

  it('renames several unmergeable HRV categories past a suffix that is already taken', async () => {
    // #3041: three health syncs each created an HRV category, and "HRV (2)"
    // was already a name. The two that cannot be merged must not both become
    // "HRV (3)", or the unique index cannot be built.
    await db.query(
      'DROP INDEX IF EXISTS public.custom_categories_user_name_key'
    );
    const oldest = await insertCategory(
      'HRV',
      '2026-09-01T00:00:00Z',
      'HRV',
      'health'
    );
    const second = await insertCategory(
      'HRV',
      '2026-09-02T00:00:00Z',
      'HRV',
      'health'
    );
    const third = await insertCategory(
      'HRV',
      '2026-09-03T00:00:00Z',
      'HRV',
      'health'
    );
    const taken = await insertCategory(
      'HRV (2)',
      '2025-01-01T00:00:00Z',
      'HRV (2)',
      'ms'
    );
    await insertMeasurement(oldest, '2026-09-10', 'Health Connect');
    await insertMeasurement(second, '2026-09-10', 'Health Connect');
    await insertMeasurement(third, '2026-09-10', 'Health Connect');

    await db.query(MIGRATION_SQL);

    const names = await db.query(
      `SELECT id, name FROM public.custom_categories
       WHERE id = ANY($1::uuid[])`,
      [[oldest, second, third, taken]]
    );
    expect(Object.fromEntries(names.rows.map((r) => [r.id, r.name]))).toEqual({
      [oldest]: 'HRV',
      [taken]: 'HRV (2)',
      [second]: 'HRV (3)',
      [third]: 'HRV (4)',
    });
  });

  it('returns one category when two creates of the same name overlap', async () => {
    const create = () =>
      measurementRepository.createCustomCategory({
        user_id: userId,
        created_by_user_id: userId,
        name: 'Body Fat',
        display_name: null,
        frequency: 'Daily',
        measurement_type: '%',
        data_type: 'numeric',
      });

    const [a, b] = await Promise.all([create(), create()]);

    expect(a.id).toBe(b.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const rows = await db.query(
      'SELECT id FROM public.custom_categories WHERE user_id = $1 AND name = $2',
      [userId, 'Body Fat']
    );
    expect(rows.rows).toEqual([{ id: a.id }]);
  });
});
