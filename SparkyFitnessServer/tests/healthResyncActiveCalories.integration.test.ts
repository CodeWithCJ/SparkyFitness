/**
 * A workout re-sync range-deletes the provider source's exercise entries for
 * the days it covers before re-inserting the workouts. The day's Active
 * Calories summary carries the same source but is written by `active_calories`,
 * often in another request, so the delete must leave it alone (#3620).
 *
 * Drives the real `processHealthData` path against a test database. Skipped
 * unless a `*test*` database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import measurementService from '../services/measurementService.js';

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
  // Only run against a test database.
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

interface DayRow {
  id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  source: string;
  source_id: string | null;
  calories_burned: number;
  duration_minutes: number;
}

describe.runIf(RUN)('workout re-sync keeps the Active Calories summary', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const activeCalories = (date: string, value: number, source: string) => ({
    type: 'active_calories',
    source,
    value,
    date,
  });

  const walk = (
    date: string,
    source: string,
    sourceId: string | undefined,
    caloriesBurned = 150,
    activityType = 'Walking'
  ) => ({
    type: 'Workout',
    source,
    ...(sourceId === undefined ? {} : { source_id: sourceId }),
    activityType,
    caloriesBurned,
    duration: 1800,
    date,
  });

  const sync = async (payload: Record<string, unknown>[]) => {
    const result = await measurementService.processHealthData(
      payload,
      userId,
      userId
    );
    expect(result.errors).toEqual([]);
    return result;
  };

  const dayRows = async (entryDate: string): Promise<DayRow[]> =>
    (
      await db.query<DayRow>(
        `SELECT id, exercise_id, exercise_name, source, source_id,
                calories_burned::float AS calories_burned,
                duration_minutes::float AS duration_minutes
         FROM public.exercise_entries
         WHERE user_id = $1 AND entry_date = $2
         ORDER BY created_at, id`,
        [userId, entryDate]
      )
    ).rows;

  const summaryOf = (rows: DayRow[]) =>
    rows.filter((row) => row.exercise_name === 'Active Calories');
  const summaryShaped = (rows: DayRow[]) =>
    summaryOf(rows).filter(
      (row) => row.source_id === null && row.duration_minutes === 0
    );
  const walksOf = (rows: DayRow[]) =>
    rows.filter((row) => row.exercise_name === 'Walking');

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `health-resync-active-calories-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query(
      `DELETE FROM public.exercise_entry_activity_details
       WHERE exercise_entry_id IN (
         SELECT id FROM public.exercise_entries WHERE user_id = $1
       )`,
      [userId]
    );
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public.exercises WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it.each([
    ['HealthKit', '2026-01-02', 'synthetic-hk-walk-1'],
    ['Health Connect', '2026-01-03', 'synthetic-hc-walk-1'],
  ])(
    'keeps the %s summary through a workout-only re-sync',
    async (source, date, walkId) => {
      await sync([
        activeCalories(date, 400, source),
        walk(date, source, walkId),
      ]);

      await sync([walk(date, source, walkId)]);

      const rows = await dayRows(date);
      const summary = summaryOf(rows);
      expect(summary).toHaveLength(1);
      expect(summary[0].calories_burned).toBe(400);
      expect(summary[0].source).toBe(source);
      const walks = walksOf(rows);
      expect(walks).toHaveLength(1);
      expect(walks[0].source_id).toBe(walkId);
    }
  );

  it('still removes stale workouts of the source', async () => {
    const date = '2026-01-04';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'HealthKit', 'synthetic-hk-walk-a'),
      walk(date, 'HealthKit', 'synthetic-hk-walk-b', 90),
    ]);
    expect(walksOf(await dayRows(date))).toHaveLength(2);

    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-a')]);

    const rows = await dayRows(date);
    expect(walksOf(rows).map((row) => row.source_id)).toEqual([
      'synthetic-hk-walk-a',
    ]);
    const summary = summaryOf(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].calories_burned).toBe(400);
  });

  it('keeps a summary whose library exercise was deleted', async () => {
    const date = '2026-01-05';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'HealthKit', 'synthetic-hk-walk-orphan'),
    ]);
    // Mimics a deleted library exercise: exercise_id is ON DELETE SET NULL.
    await db.query(
      `UPDATE public.exercise_entries SET exercise_id = NULL
       WHERE user_id = $1 AND entry_date = $2
         AND exercise_name = 'Active Calories'`,
      [userId, date]
    );

    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-orphan')]);

    const summary = summaryOf(await dayRows(date));
    expect(summary).toHaveLength(1);
    expect(summary[0].exercise_id).toBeNull();
    expect(summary[0].calories_burned).toBe(400);
  });

  it('leaves other sources untouched', async () => {
    const date = '2026-01-06';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'manual', 'synthetic-manual-walk', 120),
      walk(date, 'Health Connect', 'synthetic-hc-walk-other', 130),
      walk(date, 'HealthKit', 'synthetic-hk-walk-other'),
    ]);
    const before = await dayRows(date);
    const othersBefore = before.filter((row) => row.source !== 'HealthKit');
    expect(othersBefore).toHaveLength(2);

    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-other')]);

    const after = await dayRows(date);
    expect(after.filter((row) => row.source !== 'HealthKit')).toEqual(
      othersBefore
    );
    expect(
      walksOf(after)
        .filter((row) => row.source === 'HealthKit')
        .map((row) => row.source_id)
    ).toEqual(['synthetic-hk-walk-other']);
    expect(summaryOf(after)).toHaveLength(1);
  });

  it('still removes a stale workout named Active Calories', async () => {
    const date = '2026-01-07';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'HealthKit', 'synthetic-hk-named', 200, 'Active Calories'),
    ]);
    const before = summaryOf(await dayRows(date));
    expect(before).toHaveLength(2);
    expect(summaryShaped(before)).toHaveLength(1);

    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-other-day')]);

    const rows = await dayRows(date);
    const named = summaryOf(rows);
    expect(named).toHaveLength(1);
    expect(named[0].source_id).toBeNull();
    expect(named[0].duration_minutes).toBe(0);
    expect(named[0].calories_burned).toBe(400);
    expect(walksOf(rows).map((row) => row.source_id)).toEqual([
      'synthetic-hk-walk-other-day',
    ]);
  });

  it('does not pile up workouts sent without a source_id', async () => {
    const date = '2026-01-08';
    await sync([activeCalories(date, 400, 'HealthKit')]);

    for (let i = 0; i < 3; i += 1) {
      await sync([walk(date, 'HealthKit', undefined)]);
    }

    const rows = await dayRows(date);
    const walks = walksOf(rows);
    expect(walks).toHaveLength(1);
    expect(walks[0].source_id).toBeNull();
    const summary = summaryOf(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].calories_burned).toBe(400);
  });

  it('updates the kept summary in place when it is sent again', async () => {
    const date = '2026-01-09';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'HealthKit', 'synthetic-hk-walk-resend'),
    ]);
    const [stored] = summaryOf(await dayRows(date));
    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-resend')]);

    await sync([activeCalories(date, 450, 'HealthKit')]);

    const summary = summaryOf(await dayRows(date));
    expect(summary).toHaveLength(1);
    expect(summary[0].id).toBe(stored.id);
    expect(summary[0].calories_burned).toBe(450);
  });

  it('updates a kept orphaned summary in place when it is sent again', async () => {
    const date = '2026-01-10';
    await sync([
      activeCalories(date, 400, 'HealthKit'),
      walk(date, 'HealthKit', 'synthetic-hk-walk-orphan-resend'),
    ]);
    await db.query(
      `UPDATE public.exercise_entries SET exercise_id = NULL
       WHERE user_id = $1 AND entry_date = $2
         AND exercise_name = 'Active Calories'`,
      [userId, date]
    );
    const [stored] = summaryOf(await dayRows(date));
    await sync([walk(date, 'HealthKit', 'synthetic-hk-walk-orphan-resend')]);

    await sync([activeCalories(date, 500, 'HealthKit')]);

    const summary = summaryOf(await dayRows(date));
    expect(summary).toHaveLength(1);
    expect(summary[0].id).toBe(stored.id);
    expect(summary[0].calories_burned).toBe(500);
  });

  it('keeps the existing exclusion parameter as on main (Garmin)', async () => {
    const date = '2026-01-11';
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO public.exercise_entries
         (user_id, entry_date, exercise_id, exercise_name, source,
          duration_minutes, calories_burned)
       VALUES ($1, $2, NULL, 'Active Calories', 'garmin', 0, 300)
       RETURNING id`,
      [userId, date]
    );

    await exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate(
      userId,
      date,
      date,
      'garmin',
      'Active Calories'
    );

    const left = await db.query(
      'SELECT id FROM public.exercise_entries WHERE id = $1',
      [inserted.rows[0].id]
    );
    expect(left.rows).toHaveLength(0);
  });
});
