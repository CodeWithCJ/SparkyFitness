/**
 * Editing a grouped workout locks the session's exercise rows and its preset
 * row. Overlapping edits of one session must queue behind each other, never
 * deadlock (PostgreSQL would abort one with 40P01).
 *
 * Skipped unless a test database is reachable, since the tests briefly lock
 * the whole exercise_entries table.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { endPool } from '../db/poolManager.js';
import exerciseService from '../services/exerciseService.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';

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
  // These tests briefly lock whole tables, so only run against a test database.
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

describe.runIf(RUN)('overlapping edits of one grouped workout', () => {
  let db: pg.Client;
  let gate: pg.Client;
  const userId = randomUUID();

  // Two exercises in one session, inserted as separate rows so their
  // physical, id and sort orders are independent of each other.
  const insertSession = async () => {
    const presetId = (
      await db.query(
        `INSERT INTO public.exercise_preset_entries
           (user_id, name, entry_date, source, created_by_user_id)
         VALUES ($1, 'Lift', '2026-09-20', 'manual', $1)
         RETURNING id`,
        [userId]
      )
    ).rows[0].id as string;
    const ids: string[] = [];
    for (const [name, sortOrder] of [
      ['Squat', 0],
      ['Bench', 1],
    ] as const) {
      ids.push(
        (
          await db.query(
            `INSERT INTO public.exercise_entries
               (user_id, entry_date, exercise_name, duration_minutes,
                calories_burned, sort_order, source, exercise_preset_entry_id)
             VALUES ($1, '2026-09-20', $2, 10, 50, $3, 'manual', $4)
             RETURNING id`,
            [userId, name, sortOrder, presetId]
          )
        ).rows[0].id as string
      );
    }
    return { presetId, ids };
  };

  const reorder = (presetId: string, ordered: string[], notes: string) =>
    exerciseService.updateGroupedWorkoutSession(userId, userId, presetId, {
      exercises: ordered.map((id, index) => ({
        id,
        exercise_id: null,
        notes,
        sets: [],
        duration_minutes: 10,
        calories_burned: 50,
        sort_order: index,
      })),
    });

  const children = async (presetId: string) =>
    (
      await db.query(
        `SELECT id, notes, sort_order, entry_date::text AS entry_date
         FROM public.exercise_entries
         WHERE exercise_preset_entry_id = $1 ORDER BY sort_order`,
        [presetId]
      )
    ).rows;

  const gatePid = async () =>
    (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;

  // Sessions waiting on the gate, directly or behind one that is.
  const waitersBehindGate = async (pid: number) =>
    (
      await db.query(
        `WITH waiting AS (
           SELECT pid, pg_blocking_pids(pid) AS blockers
           FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'
         )
         SELECT count(*)::int AS n FROM waiting w
         WHERE $1 = ANY(w.blockers)
            OR EXISTS (
              SELECT 1 FROM waiting v
              WHERE v.pid = ANY(w.blockers) AND $1 = ANY(v.blockers)
            )`,
        [pid]
      )
    ).rows[0].n as number;

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `grouped-lock-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query(
      'DELETE FROM public.exercise_preset_entries WHERE user_id = $1',
      [userId]
    );
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await gate.end();
    await endPool();
  });

  /**
   * Holds exercise_entries in SHARE mode so `first` parks on it after taking
   * whatever it takes before the exercises, starts `second` once it is parked,
   * then releases both and returns how each settled.
   */
  const raceBehindGate = async (
    first: () => Promise<unknown>,
    second: () => Promise<unknown>
  ) => {
    const pid = await gatePid();
    await gate.query('BEGIN');
    await gate.query('LOCK TABLE public.exercise_entries IN SHARE MODE');
    try {
      const settledFirst = Promise.allSettled([first()]);
      await vi.waitFor(
        async () => expect(await waitersBehindGate(pid)).toBeGreaterThan(0),
        { timeout: 10000, interval: 50 }
      );
      const settledSecond = Promise.allSettled([second()]);
      await vi.waitFor(
        async () => expect(await waitersBehindGate(pid)).toBeGreaterThan(1),
        { timeout: 10000, interval: 50 }
      );
      return Promise.all([settledFirst, settledSecond]).then((all) =>
        all.flat()
      );
    } finally {
      await gate.query('COMMIT');
    }
  };

  it('queues a reorder behind a date move of the same session', async () => {
    const { presetId, ids } = await insertSession();
    const [a, b] = ids;

    // The date move writes the session row, then waits to move its exercises.
    const settled = await raceBehindGate(
      () =>
        exerciseService.updateGroupedWorkoutSession(userId, userId, presetId, {
          entry_date: '2026-09-21',
        }),
      () => reorder(presetId, [b, a], 'reordered')
    );

    for (const result of settled) {
      if (result.status === 'rejected') throw result.reason;
    }
    expect(await children(presetId)).toEqual([
      expect.objectContaining({
        id: b,
        notes: 'reordered',
        entry_date: '2026-09-21',
      }),
      expect.objectContaining({
        id: a,
        notes: 'reordered',
        entry_date: '2026-09-21',
      }),
    ]);
  });

  it('lets a delete of the session finish before a racing reorder', async () => {
    const { presetId, ids } = await insertSession();
    const [a, b] = ids;

    // The delete removes the session row, then its cascade waits to remove the
    // exercises. SHARE mode still lets the reorder lock the exercises, so only
    // the session row lock keeps it from holding them against the cascade.
    const [deleted, reordered] = await raceBehindGate(
      () =>
        exercisePresetEntryRepository.deleteExercisePresetEntry(
          presetId,
          userId
        ),
      () => reorder(presetId, [b, a], 'reordered')
    );

    if (deleted.status === 'rejected') throw deleted.reason;
    expect(deleted.value).toBe(true);
    expect(reordered).toMatchObject({
      status: 'rejected',
      reason: { status: 404 },
    });
    expect(await children(presetId)).toEqual([]);
  });
});
