/**
 * An entry's stored modality can be NULL. The progress route then answers with
 * the exercise's modality, so a bodyweight lift keeps its no-weight sets and
 * counts body weight in its load.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countedTrendSets,
  exerciseTrendEntryValueKg,
  type ExerciseProgressResponse,
} from '@workspace/shared';
import { endPool } from '../db/poolManager.js';
import { getExerciseProgressData } from '../models/exerciseEntry.js';

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

describe.runIf(RUN)('exercise progress with a NULL entry modality', () => {
  let db: pg.Client;
  const userId = randomUUID();
  const exerciseId = randomUUID();

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `progress-modality-${userId}@example.test`]
    );
    await db.query(
      `INSERT INTO public.exercises (id, user_id, name, source, category, modality)
       VALUES ($1, $2, 'Pull-up', 'custom', 'Strength', 'bodyweight_reps')`,
      [exerciseId, userId]
    );
    await db.query(
      `INSERT INTO public.check_in_measurements (user_id, entry_date, weight)
       VALUES ($1, '2026-11-02', 80)`,
      [userId]
    );
    const entry = await db.query(
      `INSERT INTO public.exercise_entries
         (user_id, exercise_id, exercise_name, entry_date, duration_minutes, calories_burned, modality)
       VALUES ($1, $2, 'Pull-up', '2026-11-02', 10, 50, NULL)
       RETURNING id`,
      [userId, exerciseId]
    );
    await db.query(
      `INSERT INTO public.exercise_entry_sets
         (exercise_entry_id, set_number, set_type, reps, weight)
       VALUES ($1, 1, 'Working Set', 8, NULL)`,
      [entry.rows[0].id]
    );
    // December: one standalone entry and one linked to an AMRAP session.
    const presetEntryId = randomUUID();
    await db.query(
      `INSERT INTO public.exercise_preset_entries
         (id, user_id, name, entry_date, source, workout_format)
       VALUES ($1, $2, 'Murph-ish', '2026-12-02', 'manual', 'amrap')`,
      [presetEntryId, userId]
    );
    await db.query(
      `INSERT INTO public.exercise_entries
         (user_id, exercise_id, entry_date, duration_minutes, calories_burned, exercise_preset_entry_id)
       VALUES ($1, $2, '2026-12-01', 10, 50, NULL),
              ($1, $2, '2026-12-02', 10, 50, $3)`,
      [userId, exerciseId, presetEntryId]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('keeps the no-weight sets and counts body weight', async () => {
    const rows = (await getExerciseProgressData(
      userId,
      exerciseId,
      '2026-11-01',
      '2026-11-30'
    )) as ExerciseProgressResponse[];
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.modality).toBe('bodyweight_reps');
    expect(countedTrendSets(row)).toHaveLength(1);
    expect(exerciseTrendEntryValueKg(row, 'volume')).toBe(80 * 8);
  });

  it('returns the session workout_format (null for a standalone entry)', async () => {
    const rows = (await getExerciseProgressData(
      userId,
      exerciseId,
      '2026-12-01',
      '2026-12-31'
    )) as { entry_date: unknown; workout_format: string | null }[];
    expect(rows.map((r) => r.workout_format)).toEqual([null, 'amrap']);
  });

  it('returns the raw entry modality and the entry name', async () => {
    const rows = (await getExerciseProgressData(
      userId,
      exerciseId,
      '2026-11-01',
      '2026-11-30'
    )) as { entry_modality: string | null; exercise_name: string | null }[];
    // The 11-02 entry stores a NULL modality although the exercise has one.
    expect(rows[0]!.entry_modality).toBeNull();
    expect(rows[0]!.exercise_name).toBe('Pull-up');

    await db.query(
      `UPDATE public.exercise_entries SET modality = 'bodyweight_reps'
        WHERE user_id = $1 AND entry_date = '2026-11-02'`,
      [userId]
    );
    let after: { entry_modality: string | null }[];
    try {
      after = (await getExerciseProgressData(
        userId,
        exerciseId,
        '2026-11-01',
        '2026-11-30'
      )) as { entry_modality: string | null }[];
    } finally {
      await db.query(
        `UPDATE public.exercise_entries SET modality = NULL
          WHERE user_id = $1 AND entry_date = '2026-11-02'`,
        [userId]
      );
    }
    expect(after[0]!.entry_modality).toBe('bodyweight_reps');
  });
});
