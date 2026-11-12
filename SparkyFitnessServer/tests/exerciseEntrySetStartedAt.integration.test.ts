/**
 * started_at on exercise_entry_sets (#2840) against a real database: an
 * update that omits the field keeps the stored start, an explicit null clears
 * it, and the diary read returns it next to completed_at.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';

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

const ENTRY_DATE = '2026-11-12';
const STARTED = '2026-11-12T09:30:05.000Z';
const COMPLETED = '2026-11-12T09:31:10.000Z';

describe.runIf(RUN)('set started_at', () => {
  let db: pg.Client;
  const userId = randomUUID();
  const exerciseId = randomUUID();
  let entryId: string;

  const storedStarts = async () =>
    (
      await db.query(
        `SELECT id, set_number, started_at FROM public.exercise_entry_sets
         WHERE exercise_entry_id = $1 ORDER BY set_number`,
        [entryId]
      )
    ).rows.map((r: { set_number: number; started_at: Date | null }) => [
      r.set_number,
      r.started_at ? r.started_at.toISOString() : null,
    ]);

  const setIds = async () =>
    (
      await db.query(
        `SELECT id FROM public.exercise_entry_sets
         WHERE exercise_entry_id = $1 ORDER BY set_number`,
        [entryId]
      )
    ).rows.map((r: { id: number }) => r.id);

  // The fields the mobile app sends today for a stored set: no started_at.
  const sentByCurrentApp = (id: number, setNumber: number) => ({
    id,
    set_number: setNumber,
    set_type: 'normal',
    reps: 8,
    weight: 60,
    duration: null,
    distance: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    rir: null,
    completed_at: COMPLETED,
    is_pr: false,
  });

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `set-started-${userId}@example.test`]
    );
    await db.query(
      `INSERT INTO public.exercises (id, user_id, name, category, calories_per_hour, modality, source)
       VALUES ($1, $2, 'Bench Press', 'strength', 300, 'weight_reps', 'custom')`,
      [exerciseId, userId]
    );
    const entry = await db.query(
      `INSERT INTO public.exercise_entries
         (user_id, exercise_id, entry_date, duration_minutes, calories_burned, exercise_name, modality, created_by_user_id)
       VALUES ($1, $2, $3, 10, 50, 'Bench Press', 'weight_reps', $1) RETURNING id`,
      [userId, exerciseId, ENTRY_DATE]
    );
    entryId = entry.rows[0].id;
    await db.query(
      `INSERT INTO public.exercise_entry_sets (exercise_entry_id, set_number, reps, weight, completed_at, started_at)
       VALUES ($1, 1, 8, 60, $2, $3), ($1, 2, 8, 60, $2, $3), ($1, 3, 8, 60, $2, $3)`,
      [entryId, COMPLETED, STARTED]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public.exercises WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('returns started_at next to completed_at in the diary read', async () => {
    const entries = await exerciseEntryDb.getExerciseEntriesByDate(
      userId,
      ENTRY_DATE
    );
    const entry = entries.find((e: { id: string }) => e.id === entryId);
    expect(entry).toBeDefined();
    expect(
      entry.sets.map((s: { started_at: string | null }) => s.started_at)
    ).toEqual([STARTED, STARTED, STARTED]);
  });

  it('keeps the stored start when a live workout save omits it, and clears it on null', async () => {
    const [a, b, c] = await setIds();
    await db.query('BEGIN');
    await exerciseEntryDb._reconcileExerciseEntrySetsWithClient(db, entryId, [
      sentByCurrentApp(a, 1),
      { ...sentByCurrentApp(b, 2), started_at: null },
      { ...sentByCurrentApp(c, 3), started_at: '2026-11-12T09:40:00.000Z' },
      { ...sentByCurrentApp(0, 4), id: undefined },
    ]);
    await db.query('COMMIT');
    expect(await storedStarts()).toEqual([
      [1, STARTED],
      [2, null],
      [3, '2026-11-12T09:40:00.000Z'],
      [4, null],
    ]);
  });

  it('keeps the stored start when the sets are replaced and a set comes back by id without it', async () => {
    const [a, b, c, d] = await setIds();
    await db.query(
      'UPDATE public.exercise_entry_sets SET started_at = $2 WHERE id = ANY($1::int[])',
      [[a, b, c, d], STARTED]
    );
    await db.query('BEGIN');
    await exerciseEntryDb._updateExerciseEntryWithClient(
      db as never,
      entryId,
      userId,
      {
        sets: [
          { id: a, set_number: 1, reps: 8, weight: 60 },
          { id: b, set_number: 2, reps: 8, weight: 60, started_at: null },
          { set_number: 3, reps: 8, weight: 60 },
        ],
      },
      userId,
      undefined
    );
    await db.query('COMMIT');
    expect(await storedStarts()).toEqual([
      [1, STARTED],
      [2, null],
      [3, null],
    ]);
  });
});
