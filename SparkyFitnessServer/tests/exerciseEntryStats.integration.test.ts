/**
 * Exercise stats SQL behavior — integration test.
 *
 * WHY THIS EXISTS
 * ---------------
 * `getBestSetForExercise` / `getLastSetForExercise` / `getRecentSessionsForExercise`
 * carry SQL-level rules that a mocked pool cannot prove: the warmup exclusion
 * (`set_type` normalized and prefix-matched against `warmup`), the optional session
 * exclusion (`excludePresetEntryId`) that keeps today's in-progress/planned sets out
 * of the historical baseline, and the recent-sessions LIMIT/ordering (entry_date,
 * created_at, then ee.id DESC) with its weight-or-reps set filtering. These run
 * inside Postgres, so this test drives the real model functions against a real DB,
 * seeding via the superuser client and reading back through the RLS-enforced
 * `getClient(userId)` path the model uses.
 *
 * It seeds and deletes only its own synthetic `@example.test` rows. The gate does
 * a short-timeout connection probe, so it SKIPS cleanly when no database is
 * reachable (mirrors rlsPermissionMatrix.integration.test.ts).
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSystemClient, endPool } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';

async function statsDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
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

const RUN = await statsDbReachable();

// Stable, namespaced UUIDs so cleanup is unambiguous.
const U = '00000000-0000-4000-b000-0000000000aa';
const E1 = '00000000-0000-4000-b000-0000000000e1'; // warmup exclusion
const E2 = '00000000-0000-4000-b000-0000000000e2'; // session exclusion
const E3 = '00000000-0000-4000-b000-0000000000e3'; // null-preset always counted
const E4 = '00000000-0000-4000-b000-0000000000e4'; // recent sessions: limit + ordering
const E5 = '00000000-0000-4000-b000-0000000000e5'; // recent sessions: null/set-less filtering
const PE_CURRENT = '00000000-0000-4000-b000-0000000000c1';
const PE_OTHER = '00000000-0000-4000-b000-0000000000c2';

const EN1 = '00000000-0000-4000-b000-000000000101';
const EN2_INDIV = '00000000-0000-4000-b000-000000000201';
const EN2_OTHER = '00000000-0000-4000-b000-000000000202';
const EN2_CURRENT = '00000000-0000-4000-b000-000000000203';
const EN3_INDIV = '00000000-0000-4000-b000-000000000301';
const EN3_CURRENT = '00000000-0000-4000-b000-000000000302';
const EN4_OLD = '00000000-0000-4000-b000-000000000401';
const EN4_MID = '00000000-0000-4000-b000-000000000402';
const EN4_TIE_LO = '00000000-0000-4000-b000-000000000403';
const EN4_TIE_HI = '00000000-0000-4000-b000-000000000404';
const EN5_CARDIO = '00000000-0000-4000-b000-000000000501';
const EN5_NULLSETS = '00000000-0000-4000-b000-000000000502';
const EN5_MIXED = '00000000-0000-4000-b000-000000000503';

const ALL_EXERCISES = [E1, E2, E3, E4, E5];

describe.runIf(RUN)('exercise stats SQL (warmup + session exclusion)', () => {
  beforeAll(async () => {
    const sys = await getSystemClient();
    try {
      // Idempotent clean slate (entries cascade their sets).
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE user_id = $1',
        [U]
      );
      await sys.query(
        'DELETE FROM public.exercise_preset_entries WHERE user_id = $1',
        [U]
      );
      await sys.query(
        'DELETE FROM public.exercises WHERE id = ANY($1::uuid[])',
        [ALL_EXERCISES]
      );
      await sys.query('DELETE FROM public."user" WHERE id = $1', [U]);

      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
        [U, `exercise-stats-${U}@example.test`]
      );
      for (const [id, name] of [
        [E1, 'Stats Test Exercise 1'],
        [E2, 'Stats Test Exercise 2'],
        [E3, 'Stats Test Exercise 3'],
        [E4, 'Stats Test Exercise 4'],
        [E5, 'Stats Test Exercise 5'],
      ] as const) {
        await sys.query(
          'INSERT INTO public.exercises (id, name, source, user_id, is_custom) VALUES ($1, $2, $3, $4, true)',
          [id, name, 'test', U]
        );
      }
      for (const [id, name] of [
        [PE_CURRENT, 'Current Session'],
        [PE_OTHER, 'Other Session'],
      ] as const) {
        await sys.query(
          'INSERT INTO public.exercise_preset_entries (id, user_id, name, entry_date, source) VALUES ($1, $2, $3, $4, $5)',
          [id, U, name, '2026-07-07', 'manual']
        );
      }

      const insertEntry = async (
        id: string,
        exerciseId: string,
        presetEntryId: string | null,
        entryDate = '2026-07-07',
        createdAt: string | null = null
      ) => {
        await sys.query(
          `INSERT INTO public.exercise_entries
             (id, user_id, exercise_id, duration_minutes, calories_burned, entry_date, exercise_preset_entry_id, created_at)
           VALUES ($1, $2, $3, 0, 0, $4, $5, COALESCE($6::timestamptz, now()))`,
          [id, U, exerciseId, entryDate, presetEntryId, createdAt]
        );
      };
      const insertSet = async (
        entryId: string,
        setNumber: number,
        setType: string,
        weight: number | null,
        reps: number | null
      ) => {
        await sys.query(
          `INSERT INTO public.exercise_entry_sets
             (exercise_entry_id, set_number, set_type, weight, reps)
           VALUES ($1, $2, $3, $4, $5)`,
          [entryId, setNumber, setType, weight, reps]
        );
      };

      // E1 — warmup variants must not inflate best; last-set keeps warmups.
      await insertEntry(EN1, E1, null);
      await insertSet(EN1, 1, 'Working Set', 100, 5);
      await insertSet(EN1, 2, 'Warm-up Set', 999, 1);
      await insertSet(EN1, 3, 'warmup', 888, 1);
      await insertSet(EN1, 4, 'Warm up', 777, 1);

      // E2 — session exclusion: current session is the heaviest.
      await insertEntry(EN2_INDIV, E2, null);
      await insertSet(EN2_INDIV, 1, 'Working Set', 100, 5);
      await insertEntry(EN2_OTHER, E2, PE_OTHER);
      await insertSet(EN2_OTHER, 1, 'Working Set', 110, 4);
      await insertEntry(EN2_CURRENT, E2, PE_CURRENT);
      await insertSet(EN2_CURRENT, 1, 'Working Set', 130, 3);

      // E3 — excluding the current session must NOT drop the individual entry.
      await insertEntry(EN3_INDIV, E3, null);
      await insertSet(EN3_INDIV, 1, 'Working Set', 100, 5);
      await insertEntry(EN3_CURRENT, E3, PE_CURRENT);
      await insertSet(EN3_CURRENT, 1, 'Working Set', 130, 3);

      // E4 — recent sessions: 4 entries so LIMIT 3 drops the oldest; the two
      // 2026-07-07 entries share created_at to force the ee.id DESC tiebreak.
      await insertEntry(EN4_OLD, E4, null, '2026-07-01');
      await insertSet(EN4_OLD, 1, 'Working Set', 80, 8);
      await insertEntry(EN4_MID, E4, null, '2026-07-03');
      await insertSet(EN4_MID, 1, 'Working Set', 90, 6);
      await insertEntry(
        EN4_TIE_LO,
        E4,
        null,
        '2026-07-07',
        '2026-07-07T10:00:00Z'
      );
      await insertSet(EN4_TIE_LO, 1, 'Working Set', 100, 5);
      await insertEntry(
        EN4_TIE_HI,
        E4,
        null,
        '2026-07-07',
        '2026-07-07T10:00:00Z'
      );
      await insertSet(EN4_TIE_HI, 1, 'Working Set', 110, 3);

      // E5 — recent sessions: set-less (cardio) and all-null entries are
      // skipped; a both-null set inside a mixed entry is omitted.
      await insertEntry(EN5_CARDIO, E5, null, '2026-07-06');
      await insertEntry(EN5_NULLSETS, E5, null, '2026-07-05');
      await insertSet(EN5_NULLSETS, 1, 'Working Set', null, null);
      await insertEntry(EN5_MIXED, E5, null, '2026-07-04');
      await insertSet(EN5_MIXED, 1, 'Working Set', null, null);
      await insertSet(EN5_MIXED, 2, 'Working Set', 50, 10);
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE user_id = $1',
        [U]
      );
      await sys.query(
        'DELETE FROM public.exercise_preset_entries WHERE user_id = $1',
        [U]
      );
      await sys.query(
        'DELETE FROM public.exercises WHERE id = ANY($1::uuid[])',
        [ALL_EXERCISES]
      );
      await sys.query('DELETE FROM public."user" WHERE id = $1', [U]);
    } finally {
      sys.release();
    }
    await endPool();
  });

  it('excludes every warmup variant from the best set', async () => {
    const best = await exerciseEntryDb.getBestSetForExercise(U, E1);
    expect(best).not.toBeNull();
    // 100 (Working Set), NOT 999/888/777 (warmup variants).
    expect(Number(best.weight)).toBe(100);
  });

  it('keeps warmups in the last set (last-time semantics unchanged)', async () => {
    const last = await exerciseEntryDb.getLastSetForExercise(U, E1);
    expect(last).not.toBeNull();
    // Highest set_number wins; the warmup at set 4 is the most recent.
    expect(Number(last.weight)).toBe(777);
  });

  it('counts every session when no exclusion is passed', async () => {
    const best = await exerciseEntryDb.getBestSetForExercise(U, E2, null);
    expect(Number(best.weight)).toBe(130);
  });

  it('excludes the current session but keeps other same-day sessions', async () => {
    const best = await exerciseEntryDb.getBestSetForExercise(U, E2, PE_CURRENT);
    // 130 (current) dropped; 110 (PE_OTHER) still counts, beating 100 (individual).
    expect(Number(best.weight)).toBe(110);
  });

  it('always counts null-preset (individual) entries even under exclusion', async () => {
    const best = await exerciseEntryDb.getBestSetForExercise(U, E3, PE_CURRENT);
    // 130 (current) dropped; only the individual 100 remains.
    expect(Number(best.weight)).toBe(100);
  });

  it('returns the newest three sessions with the ee.id DESC tiebreak', async () => {
    const sessions = await exerciseEntryDb.getRecentSessionsForExercise(U, E4);
    // LIMIT 3 drops EN4_OLD (2026-07-01); the same-date/same-created_at pair
    // orders by entry id DESC, so EN4_TIE_HI (110) precedes EN4_TIE_LO (100).
    expect(sessions.map((s) => s.entry_date)).toEqual([
      '2026-07-07',
      '2026-07-07',
      '2026-07-03',
    ]);
    expect(sessions.map((s) => Number(s.sets?.[0]?.weight))).toEqual([
      110, 100, 90,
    ]);
  });

  it('treats same-date duplicate entries as separate sessions', async () => {
    const sessions = await exerciseEntryDb.getRecentSessionsForExercise(U, E4);
    const sameDay = sessions.filter((s) => s.entry_date === '2026-07-07');
    expect(sameDay).toHaveLength(2);
  });

  it('excludes the current session from recent sessions', async () => {
    const all = await exerciseEntryDb.getRecentSessionsForExercise(U, E2);
    expect(
      all.map((s) => Number(s.sets?.[0]?.weight)).sort((a, b) => a - b)
    ).toEqual([100, 110, 130]);

    const excluded = await exerciseEntryDb.getRecentSessionsForExercise(
      U,
      E2,
      PE_CURRENT
    );
    expect(
      excluded.map((s) => Number(s.sets?.[0]?.weight)).sort((a, b) => a - b)
    ).toEqual([100, 110]);
  });

  it('keeps warmups and orders sets by set_number within a session', async () => {
    const sessions = await exerciseEntryDb.getRecentSessionsForExercise(U, E1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets?.map((s) => s.set_number)).toEqual([1, 2, 3, 4]);
    // Raw set_type variants survive at the model layer (service normalizes).
    expect(sessions[0].sets?.map((s) => s.set_type)).toEqual([
      'Working Set',
      'Warm-up Set',
      'warmup',
      'Warm up',
    ]);
    expect(sessions[0].sets?.map((s) => Number(s.weight))).toEqual([
      100, 999, 888, 777,
    ]);
  });

  it('omits both-null sets and skips entries with no qualifying sets', async () => {
    const sessions = await exerciseEntryDb.getRecentSessionsForExercise(U, E5);
    // EN5_CARDIO (no sets) and EN5_NULLSETS (only a both-null set) are skipped.
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entry_date).toBe('2026-07-04');
    // The both-null set inside the mixed entry is filtered out.
    expect(sessions[0].sets).toHaveLength(1);
    expect(sessions[0].sets?.[0]?.set_number).toBe(2);
    expect(Number(sessions[0].sets?.[0]?.weight)).toBe(50);
  });
});
