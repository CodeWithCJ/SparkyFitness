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
 * `getClient(userId)` path the model uses. The history endpoint's `exerciseId`
 * session filter (EXISTS over preset children + standalone match) is proven
 * here too, against the same fixture.
 *
 * It seeds and deletes only its own synthetic `@example.test` rows. The gate does
 * a short-timeout connection probe, so it SKIPS cleanly when no database is
 * reachable (mirrors rlsPermissionMatrix.integration.test.ts).
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exerciseHistoryResponseSchema } from '@workspace/shared';
import { getSystemClient, endPool } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exercisePresetEntryDb from '../models/exercisePresetEntryRepository.js';
import { getExerciseEntryHistory } from '../services/exerciseEntryHistoryService.js';

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
const E6 = '00000000-0000-4000-b000-0000000000e6'; // recent sessions: workout_preset_id scoping
const E7 = '00000000-0000-4000-b000-0000000000e7'; // best skips WOD sessions; last does not
const PE_CURRENT = '00000000-0000-4000-b000-0000000000c1';
const PE_OTHER = '00000000-0000-4000-b000-0000000000c2';
const PE_PRESET_A_OLD = '00000000-0000-4000-b000-0000000000c3';
const PE_PRESET_A_NEW = '00000000-0000-4000-b000-0000000000c4';
const PE_INDIVIDUAL_E6 = '00000000-0000-4000-b000-0000000000c5';
const PE_PRESET_C = '00000000-0000-4000-b000-0000000000c6';

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
const EN7_INDIV = '00000000-0000-4000-b000-000000000701';
const EN7_STANDARD = '00000000-0000-4000-b000-000000000702';
const EN7_WOD = '00000000-0000-4000-b000-000000000703';

const ALL_EXERCISES = [E1, E2, E3, E4, E5, E6, E7];
let presetAId: number;
let presetBId: number;
let presetCId: number;
let presetWodId: number;
let wodSessionId: string;

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
        [E6, 'Stats Test Exercise 6'],
        [E7, 'Stats Test Exercise 7'],
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

      // Two workout presets for the recentSessions presetId-scoping test:
      // Preset A has history for E6, Preset B has none.
      await sys.query('DELETE FROM public.workout_presets WHERE user_id = $1', [
        U,
      ]);
      const presetAResult = await sys.query(
        'INSERT INTO public.workout_presets (user_id, name) VALUES ($1, $2) RETURNING id',
        [U, 'Stats Test Preset A']
      );
      presetAId = presetAResult.rows[0].id;
      const presetBResult = await sys.query(
        'INSERT INTO public.workout_presets (user_id, name) VALUES ($1, $2) RETURNING id',
        [U, 'Stats Test Preset B']
      );
      presetBId = presetBResult.rows[0].id;
      // Preset C gets exactly ONE E6 session so the exclusion edge case can be
      // tested: excluding that session must remove it from the scope probe too.
      const presetCResult = await sys.query(
        'INSERT INTO public.workout_presets (user_id, name) VALUES ($1, $2) RETURNING id',
        [U, 'Stats Test Preset C']
      );
      presetCId = presetCResult.rows[0].id;

      const insertEntry = async (
        id: string,
        exerciseId: string,
        presetEntryId: string | null,
        entryDate = '2026-07-07',
        createdAt: string | null = null
      ) => {
        // exercise_name feeds the history response's non-nullable snapshot name.
        await sys.query(
          `INSERT INTO public.exercise_entries
             (id, user_id, exercise_id, duration_minutes, calories_burned, entry_date, exercise_preset_entry_id, created_at, exercise_name)
           VALUES ($1, $2, $3, 0, 0, $4, $5, COALESCE($6::timestamptz, now()), $7)`,
          [
            id,
            U,
            exerciseId,
            entryDate,
            presetEntryId,
            createdAt,
            'Stats Test Exercise',
          ]
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

      // E6 — recentSessions presetId scoping: two sessions performed as
      // Preset A, plus a more recent/heavier individual (non-preset) session
      // that a Preset-A-scoped query must exclude.
      await sys.query(
        `INSERT INTO public.exercise_preset_entries (id, user_id, workout_preset_id, name, entry_date, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          PE_PRESET_A_OLD,
          U,
          presetAId,
          'Preset A Session (old)',
          '2026-07-01',
          'manual',
        ]
      );
      await sys.query(
        `INSERT INTO public.exercise_preset_entries (id, user_id, workout_preset_id, name, entry_date, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          PE_PRESET_A_NEW,
          U,
          presetAId,
          'Preset A Session (new)',
          '2026-07-05',
          'manual',
        ]
      );
      await sys.query(
        `INSERT INTO public.exercise_preset_entries (id, user_id, name, entry_date, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [PE_INDIVIDUAL_E6, U, 'Individual Session', '2026-07-07', 'manual']
      );
      const EN6_PRESET_OLD = '00000000-0000-4000-b000-000000000601';
      const EN6_PRESET_NEW = '00000000-0000-4000-b000-000000000602';
      const EN6_INDIVIDUAL = '00000000-0000-4000-b000-000000000603';
      await insertEntry(EN6_PRESET_OLD, E6, PE_PRESET_A_OLD, '2026-07-01');
      await insertSet(EN6_PRESET_OLD, 1, 'Working Set', 100, 8);
      await insertEntry(EN6_PRESET_NEW, E6, PE_PRESET_A_NEW, '2026-07-05');
      await insertSet(EN6_PRESET_NEW, 1, 'Working Set', 120, 6);
      await insertEntry(EN6_INDIVIDUAL, E6, PE_INDIVIDUAL_E6, '2026-07-07');
      await insertSet(EN6_INDIVIDUAL, 1, 'Working Set', 200, 4);

      // Preset C — exactly one E6 session, so the scope probe can be forced
      // to see zero qualifying sessions once that session is excluded.
      await sys.query(
        `INSERT INTO public.exercise_preset_entries (id, user_id, workout_preset_id, name, entry_date, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          PE_PRESET_C,
          U,
          presetCId,
          'Preset C Session (only)',
          '2026-07-06',
          'manual',
        ]
      );
      const EN6_PRESET_C = '00000000-0000-4000-b000-000000000604';
      await insertEntry(EN6_PRESET_C, E6, PE_PRESET_C, '2026-07-06');
      await insertSet(EN6_PRESET_C, 1, 'Working Set', 150, 5);

      // E7 — a heavy set inside an AMRAP is newest but must not become Best.
      // The WOD session goes through the repository so its format snapshot
      // is taken from the preset exactly as a real session start does.
      const presetWodResult = await sys.query(
        `INSERT INTO public.workout_presets (user_id, name, workout_format, time_cap_seconds)
         VALUES ($1, $2, 'amrap', 720) RETURNING id`,
        [U, 'Stats Test AMRAP']
      );
      presetWodId = presetWodResult.rows[0].id;
      const wodSession = await exercisePresetEntryDb.createExercisePresetEntry(
        U,
        {
          workout_preset_id: presetWodId,
          name: 'AMRAP Session',
          entry_date: '2026-07-09',
        },
        U
      );
      wodSessionId = wodSession.id;
      await insertEntry(EN7_INDIV, E7, null, '2026-07-01');
      await insertSet(EN7_INDIV, 1, 'Working Set', 100, 5);
      await insertEntry(EN7_STANDARD, E7, PE_PRESET_A_NEW, '2026-07-05');
      await insertSet(EN7_STANDARD, 1, 'Working Set', 110, 5);
      await insertEntry(EN7_WOD, E7, wodSessionId, '2026-07-09');
      await insertSet(EN7_WOD, 1, 'Working Set', 150, 20);
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
      await sys.query('DELETE FROM public.workout_presets WHERE user_id = $1', [
        U,
      ]);
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

  it('snapshots the preset format onto a new session', async () => {
    const sys = await getSystemClient();
    try {
      const res = await sys.query(
        'SELECT workout_format FROM public.exercise_preset_entries WHERE id = $1',
        [wodSessionId]
      );
      expect(res.rows[0].workout_format).toBe('amrap');
    } finally {
      sys.release();
    }
  });

  it('keeps WOD sets out of Best but counts standard and ad-hoc sets', async () => {
    const best = await exerciseEntryDb.getBestSetForExercise(U, E7);
    // 150 (AMRAP) skipped; 110 (standard preset session) beats 100 (ad-hoc).
    expect(Number(best.weight)).toBe(110);
  });

  it('still reports a WOD set as Last', async () => {
    const last = await exerciseEntryDb.getLastSetForExercise(U, E7);
    expect(Number(last.weight)).toBe(150);
  });

  it('keeps WOD sets out of Best after the preset is edited or deleted', async () => {
    const sys = await getSystemClient();
    try {
      await sys.query(
        'UPDATE public.workout_presets SET workout_format = $2 WHERE id = $1',
        [presetWodId, 'standard']
      );
      const afterEdit = await exerciseEntryDb.getBestSetForExercise(U, E7);
      expect(Number(afterEdit.weight)).toBe(110);

      await sys.query('DELETE FROM public.workout_presets WHERE id = $1', [
        presetWodId,
      ]);
      const afterDelete = await exerciseEntryDb.getBestSetForExercise(U, E7);
      expect(Number(afterDelete.weight)).toBe(110);
    } finally {
      sys.release();
    }
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

  it('scopes recent sessions to a workout preset id when supplied', async () => {
    const scoped = await exerciseEntryDb.getRecentSessionsForExercise(
      U,
      E6,
      null,
      undefined,
      presetAId
    );
    // Only the two Preset-A sessions, newest first; the heavier/more recent
    // individual (non-preset) session is excluded even though it would
    // otherwise be the top result.
    expect(scoped.map((s) => s.entry_date)).toEqual([
      '2026-07-05',
      '2026-07-01',
    ]);
    expect(scoped.map((s) => Number(s.sets?.[0]?.weight))).toEqual([120, 100]);
  });

  it('falls back to global recent sessions for a preset that was never performed', async () => {
    // Preset B has no history at all — without the fallback this returned []
    // and left the in-progress card with no baseline. Now it degrades to the
    // exercise's global recent sessions, identical to omitting presetId.
    const scoped = await exerciseEntryDb.getRecentSessionsForExercise(
      U,
      E6,
      null,
      undefined,
      presetBId
    );
    expect(scoped.map((s) => s.entry_date)).toEqual([
      '2026-07-07',
      '2026-07-06',
      '2026-07-05',
    ]);
    expect(scoped.map((s) => Number(s.sets?.[0]?.weight))).toEqual([
      200, 150, 120,
    ]);
  });

  it('falls back to global sessions when the preset is scoped but its only session is excluded', async () => {
    // Preset C has exactly one E6 session; excluding it must remove it from
    // the scope probe as well — otherwise scoping would stay active on a
    // session that the main query then excludes, leaving "Previous" empty.
    const scoped = await exerciseEntryDb.getRecentSessionsForExercise(
      U,
      E6,
      PE_PRESET_C,
      undefined,
      presetCId
    );
    expect(scoped.map((s) => s.entry_date)).toEqual([
      '2026-07-07',
      '2026-07-05',
      '2026-07-01',
    ]);
    expect(scoped.map((s) => Number(s.sets?.[0]?.weight))).toEqual([
      200, 120, 100,
    ]);
  });

  it('keeps preset scoping when another preset session survives the exclusion', async () => {
    // Excluding Preset A's newer session: the probe still sees the older
    // one, so scoping stays active and only the older session is returned.
    const scoped = await exerciseEntryDb.getRecentSessionsForExercise(
      U,
      E6,
      PE_PRESET_A_NEW,
      undefined,
      presetAId
    );
    expect(scoped.map((s) => s.entry_date)).toEqual(['2026-07-01']);
    expect(scoped.map((s) => Number(s.sets?.[0]?.weight))).toEqual([100]);
  });

  it('is unaffected by presetId scoping when presetId is omitted', async () => {
    const all = await exerciseEntryDb.getRecentSessionsForExercise(U, E6);
    expect(
      all.map((s) => Number(s.sets?.[0]?.weight)).sort((a, b) => a - b)
    ).toEqual([120, 150, 200]);
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

  it('filters history to sessions containing the exercise, keeping full preset content', async () => {
    const result = await getExerciseEntryHistory(U, 1, 20, E2);
    exerciseHistoryResponseSchema.parse(result);

    // E2 appears in both presets and one standalone entry.
    expect(result.pagination.totalCount).toBe(3);
    expect(result.sessions.map((s) => s.id).sort()).toEqual(
      [EN2_INDIV, PE_CURRENT, PE_OTHER].sort()
    );

    // The filter is session-level: PE_CURRENT still carries its E3 child.
    const current = result.sessions.find((s) => s.id === PE_CURRENT);
    expect(current?.type).toBe('preset');
    if (current?.type === 'preset') {
      expect(current.exercises.map((e) => e.exercise_id).sort()).toEqual(
        [E2, E3].sort()
      );
    }
  });

  it('excludes sessions that do not contain the filtered exercise', async () => {
    const result = await getExerciseEntryHistory(U, 1, 20, E1);
    expect(result.pagination.totalCount).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ type: 'individual', id: EN1 });
  });

  it('paginates the filtered session count', async () => {
    const result = await getExerciseEntryHistory(U, 1, 2, E2);
    expect(result.sessions).toHaveLength(2);
    expect(result.pagination).toMatchObject({ totalCount: 3, hasMore: true });
  });
});
