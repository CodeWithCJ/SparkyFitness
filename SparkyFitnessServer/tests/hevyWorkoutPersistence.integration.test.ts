import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { endPool, getClient, getRawAppPool } from '../db/poolManager.js';
import { processHevyWorkouts } from '../integrations/hevy/hevyDataProcessor.js';
import { reconcileHevyWorkouts } from '../integrations/hevy/hevyWorkoutRepository.js';
import hevyExerciseRepository from '../integrations/hevy/hevyExerciseRepository.js';
import type { HevyWorkout } from '../integrations/hevy/hevyTypes.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { processHealthData } from '../services/measurementService.js';
import { updateExerciseEntry } from '../services/exerciseService.js';
import * as calorieLinkService from '../services/exerciseCalorieLinkService.js';
import { getGroupedExerciseSessionById } from '../services/exerciseEntryHistoryService.js';
import {
  setCalorieLink,
  clearCalorieLink,
} from '../services/exerciseCalorieLinkService.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 10000,
  });
}

async function canReachTestDatabase(): Promise<boolean> {
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

function workout(
  id = 'hevy-session',
  start = '2026-11-01T17:00:00Z'
): HevyWorkout {
  return {
    id,
    title: 'Synthetic strength session',
    description: 'Imported workout',
    start_time: start,
    end_time: new Date(new Date(start).getTime() + 3_600_000).toISOString(),
    exercises: [
      {
        index: 0,
        title: 'Synthetic bench press',
        exercise_template_id: 'synthetic-bench',
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: 40,
            reps: 8,
            distance_meters: null,
            duration_seconds: null,
            rpe: 7,
          },
        ],
      },
      {
        index: 1,
        title: 'Synthetic row',
        exercise_template_id: 'synthetic-row',
        sets: [
          {
            index: 0,
            type: 'warmup',
            weight_kg: 20,
            reps: 10,
            distance_meters: null,
            duration_seconds: null,
            rpe: 6,
          },
        ],
      },
    ],
  };
}

const RUN = await canReachTestDatabase();

describe.runIf(RUN)('persistent Hevy workouts', () => {
  let db: pg.Client;
  let userId: string;

  const sync = (workouts: HevyWorkout[]) =>
    processHevyWorkouts(userId, userId, workouts, 'Europe/Berlin');
  const entries = async () =>
    (
      await db.query<{
        id: string;
        exercise_preset_entry_id: string;
        source_id: string;
        exercise_name: string;
        calories_burned: number;
        avg_heart_rate: number | null;
        notes: string | null;
      }>(
        `SELECT id, exercise_preset_entry_id, source_id, exercise_name,
                calories_burned::float8 AS calories_burned,
                avg_heart_rate::float8 AS avg_heart_rate, notes
         FROM exercise_entries WHERE user_id = $1
         ORDER BY source_id`,
        [userId]
      )
    ).rows;
  const sets = async () =>
    (
      await db.query(
        `SELECT e.source_id, s.set_number, s.set_type,
                s.weight::float8 AS weight, s.reps, s.rpe::float8 AS rpe
         FROM exercise_entry_sets s
         JOIN exercise_entries e ON e.id = s.exercise_entry_id
         WHERE e.user_id = $1 ORDER BY e.source_id, s.set_number`,
        [userId]
      )
    ).rows;

  const addHealthSession = async (source = 'Health Connect') => {
    const exercise = await exerciseRepository.createExercise({
      user_id: userId,
      name: 'Synthetic health workout',
      source: 'manual',
      is_custom: true,
      shared_with_public: false,
    });
    return exerciseEntryRepository.createExerciseEntry(
      userId,
      {
        exercise_id: exercise.id,
        entry_date: '2026-11-01',
        entry_time: '18:00',
        record_timezone: 'Europe/Berlin',
        duration_minutes: 60,
        source_id: 'synthetic-health-session',
        calories_burned: 400,
      },
      userId,
      source
    );
  };

  const countedCalories = async () =>
    (
      await db.query<{ total: number }>(
        `SELECT sum(COALESCE(calories_applied, calories_burned))::float8 AS total
       FROM exercise_entries WHERE user_id = $1`,
        [userId]
      )
    ).rows[0]!.total;

  const ingestHealthSession = async (
    source: string,
    sourceId = 'synthetic-health-session',
    calories = 400
  ) => {
    const result = await processHealthData(
      [
        {
          type: 'Workout',
          source,
          source_id: sourceId,
          activityType: 'Synthetic health workout',
          timestamp: '2026-11-01T17:00:00Z',
          record_timezone: 'Europe/Berlin',
          duration: 3600,
          caloriesBurned: calories,
        },
      ],
      userId,
      userId
    );
    expect(result.errors).toEqual([]);
    expect(result.processed).toHaveLength(1);
    const saved = await db.query<{ id: string }>(
      'SELECT id FROM exercise_entries WHERE user_id = $1 AND source = $2 AND source_id = $3',
      [userId, source, sourceId]
    );
    expect(saved.rows).toHaveLength(1);
    return saved.rows[0]!;
  };

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
  });
  beforeEach(async () => {
    userId = randomUUID();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `hevy-persistence-${userId}@example.test`]
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
  });
  afterAll(async () => {
    await db.end();
    await endPool();
  });

  it('keeps session and entry identities, calorie/HR corrections and sets on repeat sync', async () => {
    await sync([workout()]);
    const original = await entries();
    const originalSets = await sets();
    await db.query(
      `UPDATE exercise_entries SET calories_burned = 225, avg_heart_rate = 124,
              notes = 'Keep my correction',
              manual_fields = ARRAY['calories_burned', 'avg_heart_rate', 'notes']
       WHERE id = $1`,
      [original[0]!.id]
    );

    await sync([workout()]);

    expect(
      (await entries()).map((row) => [row.id, row.exercise_preset_entry_id])
    ).toEqual(original.map((row) => [row.id, row.exercise_preset_entry_id]));
    expect((await entries())[0]).toMatchObject({
      calories_burned: 225,
      avg_heart_rate: 124,
      notes: 'Keep my correction',
    });
    expect(await sets()).toEqual(originalSets);
    const details = await db.query(
      `SELECT count(*)::int AS count FROM exercise_entry_activity_details d
       JOIN exercise_entries e ON e.id = d.exercise_entry_id
       WHERE e.user_id = $1 AND d.provider_name = 'Hevy'`,
      [userId]
    );
    expect(details.rows[0].count).toBe(2);
  });

  it('preserves edited session metadata while updating untouched provider metadata', async () => {
    await sync([workout()]);
    const sessionId = (await entries())[0]!.exercise_preset_entry_id;
    const renamed = {
      ...workout(),
      title: 'New provider title',
      description: 'New provider description',
    };
    await sync([renamed]);
    expect(
      (
        await db.query(
          'SELECT name, description FROM exercise_preset_entries WHERE id = $1',
          [sessionId]
        )
      ).rows[0]
    ).toEqual({ name: renamed.title, description: renamed.description });
    await exercisePresetEntryRepository.updateExercisePresetEntry(
      sessionId,
      userId,
      { name: 'My session name', description: 'My session description' }
    );
    await sync([
      {
        ...renamed,
        title: 'Another provider title',
        description: 'Another provider description',
      },
    ]);
    expect(
      (
        await db.query(
          'SELECT name, description FROM exercise_preset_entries WHERE id = $1',
          [sessionId]
        )
      ).rows[0]
    ).toEqual({
      name: 'My session name',
      description: 'My session description',
    });
  });

  it('reapplies a linked multi-exercise workout only once after reconciliation', async () => {
    await sync([workout()]);
    const original = await entries();
    const health = await addHealthSession();
    await setCalorieLink(userId, userId, original[0]!.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });
    const reapply = vi.spyOn(
      calorieLinkService,
      'reapplyCalorieLinkWithClient'
    );
    await sync([workout()]);
    expect(reapply).toHaveBeenCalledTimes(1);
    expect(await countedCalories()).toBe(350);
  });

  it.each([350, 0])(
    'returns the persisted link and custom total %s after reimport and a fresh session read',
    async (total) => {
      await sync([workout()]);
      const original = await entries();
      const health = await addHealthSession();
      await setCalorieLink(userId, userId, original[0]!.id, {
        synced_entry_id: health.id,
        resolution: 'custom',
        custom_calories: total,
      });
      await sync([workout()]);
      const session = await getGroupedExerciseSessionById(
        userId,
        original[0]!.exercise_preset_entry_id!
      );
      expect(
        session!.exercises.map((entry) => entry.calorie_link_resolution)
      ).toEqual(['custom', 'custom']);
      expect(
        session!.exercises.reduce(
          (sum, entry) => sum + (entry.calories_applied ?? 0),
          0
        )
      ).toBe(total);
      const suggestions = await calorieLinkService.getCalorieLinkSuggestions(
        userId,
        userId,
        original[0]!.id
      );
      expect(suggestions.link).toMatchObject({
        resolution: 'custom',
        synced_entry_id: health.id,
        custom_calories: total,
      });
    }
  );

  it('removes only missing Hevy sessions in a complete fetched range and restores the linked health calories', async () => {
    await sync([
      workout('kept'),
      workout('removed'),
      workout('outside', '2026-10-30T17:00:00Z'),
    ]);
    const original = await entries();
    const removed = original.find((row) =>
      row.source_id.startsWith('removed_')
    )!;
    const health = await addHealthSession();
    await setCalorieLink(userId, userId, removed.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });
    await reconcileHevyWorkouts(
      userId,
      userId,
      ['kept'],
      '2026-11-01',
      '2026-11-01'
    );
    const saved = await entries();
    expect(saved.some((row) => row.source_id.startsWith('removed_'))).toBe(
      false
    );
    for (const row of original.filter(
      (entry) => !entry.source_id.startsWith('removed_')
    )) {
      expect(saved.some((entry) => entry.id === row.id)).toBe(true);
    }
    expect(await countedCalories()).toBe(400);
    expect(
      (
        await db.query(
          'SELECT calorie_link_id, calories_applied FROM exercise_entries WHERE id = $1',
          [health.id]
        )
      ).rows[0]
    ).toEqual({ calorie_link_id: null, calories_applied: null });
    await reconcileHevyWorkouts(userId, userId, [], '2026-11-01', '2026-11-01');
    expect(
      (await entries()).filter((row) => row.source_id.startsWith('kept_'))
    ).toEqual([]);
    expect(
      (await entries()).filter((row) => row.source_id.startsWith('outside_'))
    ).toHaveLength(2);
  });

  it.each(['Health Connect', 'HealthKit'])(
    'clears an app-logged workout link when its %s recording disappears',
    async (source) => {
      const exercise = await exerciseRepository.createExercise({
        user_id: userId,
        name: 'Synthetic app workout',
        source: 'manual',
        is_custom: true,
        shared_with_public: false,
      });
      const logged = await exerciseEntryRepository.createExerciseEntry(
        userId,
        {
          exercise_id: exercise.id,
          entry_date: '2026-11-01',
          duration_minutes: 60,
          calories_burned: 200,
        },
        userId,
        'manual'
      );
      const health = await ingestHealthSession(source);
      await setCalorieLink(userId, userId, logged.id, {
        synced_entry_id: health.id,
        resolution: 'custom',
        custom_calories: 350,
      });
      await ingestHealthSession(source, 'other-health-session', 50);
      expect(await countedCalories()).toBe(250);
      expect(
        (
          await db.query(
            'SELECT calorie_link_id, calories_applied FROM exercise_entries WHERE id = $1',
            [logged.id]
          )
        ).rows[0]
      ).toEqual({ calorie_link_id: null, calories_applied: null });
      expect(
        (
          await db.query('SELECT id FROM exercise_entries WHERE id = $1', [
            health.id,
          ])
        ).rows
      ).toEqual([]);
    }
  );

  it('adopts a legacy Hevy session through its existing exercise source ID', async () => {
    const preset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workout().title,
      is_public: false,
    });
    const session =
      await exercisePresetEntryRepository.createExercisePresetEntry(
        userId,
        {
          workout_preset_id: preset.id,
          name: workout().title,
          entry_date: '2026-11-01',
          source: 'Hevy',
        },
        userId
      );
    const exercise = await exerciseRepository.createExercise({
      user_id: userId,
      name: 'Synthetic bench press',
      source: 'Hevy',
      source_id: 'synthetic-bench',
      is_custom: true,
      shared_with_public: false,
    });
    const entry = await exerciseEntryRepository.createExerciseEntry(
      userId,
      {
        exercise_id: exercise.id,
        entry_date: '2026-11-01',
        source_id: 'hevy-session_0',
        calories_burned: 180,
      },
      userId,
      'Hevy',
      session.id
    );

    await sync([workout()]);

    expect((await entries()).find((row) => row.id === entry.id)).toMatchObject({
      id: entry.id,
      exercise_preset_entry_id: session.id,
      calories_burned: 180,
    });
    expect(
      new Set((await entries()).map((row) => row.exercise_preset_entry_id))
    ).toEqual(new Set([session.id]));
  });

  const splitLegacySession = async () => {
    await sync([workout()]);
    const original = await entries();
    const legacy =
      await exercisePresetEntryRepository.createExercisePresetEntry(
        userId,
        {
          name: workout().title,
          entry_date: '2026-11-01',
          source: 'Hevy',
        },
        userId
      );
    await db.query(
      'UPDATE exercise_entries SET exercise_preset_entry_id = $2, source_id = $3 WHERE id = $1',
      [original[0]!.id, legacy.id, 'hevy-session_0']
    );
    return { original, legacyId: String(legacy.id) };
  };

  it('removes an empty superseded legacy session while keeping entries and linked calories', async () => {
    const { original, legacyId } = await splitLegacySession();
    const health = await addHealthSession();
    await setCalorieLink(userId, userId, original[0]!.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });

    await sync([workout()]);
    await sync([workout()]);

    const sessions = await db.query<{ id: string }>(
      'SELECT id FROM exercise_preset_entries WHERE user_id = $1',
      [userId]
    );
    expect(sessions.rows).toEqual([
      { id: original[0]!.exercise_preset_entry_id },
    ]);
    expect(sessions.rows.some((session) => session.id === legacyId)).toBe(
      false
    );
    for (const entry of original)
      expect(
        (await entries()).find((row) => row.id === entry.id)
      ).toMatchObject({
        exercise_preset_entry_id: original[0]!.exercise_preset_entry_id,
      });
    expect(await countedCalories()).toBe(350);
  });

  it.each([
    'other entry',
    'notes',
    'location',
    'description',
    'activity detail',
    'feedback',
  ])(
    'retains a superseded legacy session that still contains %s',
    async (remainingData) => {
      const { original, legacyId } = await splitLegacySession();
      if (remainingData === 'other entry') {
        const exercise = await exerciseRepository.createExercise({
          user_id: userId,
          name: 'Other recorded exercise',
          source: 'manual',
          is_custom: true,
          shared_with_public: false,
        });
        await exerciseEntryRepository.createExerciseEntry(
          userId,
          { exercise_id: exercise.id, entry_date: '2026-11-01' },
          userId,
          'Manual',
          legacyId
        );
      } else if (remainingData === 'feedback') {
        await db.query(
          `INSERT INTO workout_feedback (user_id, exercise_preset_entry_id,
             difficulty, pain, created_by_user_id, updated_by_user_id)
           VALUES ($1, $2, 'just_right', false, $1, $1)`,
          [userId, legacyId]
        );
      } else if (remainingData === 'activity detail') {
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_preset_entry_id: legacyId,
          provider_name: 'Hevy',
          detail_type: 'full_activity_data',
          detail_data: { note: 'Keep the original session detail' },
          created_by_user_id: userId,
          updated_by_user_id: userId,
        });
      } else {
        const column = remainingData;
        await db.query(
          `UPDATE exercise_preset_entries SET ${column} = $2 WHERE id = $1`,
          [legacyId, 'Keep this session annotation']
        );
      }
      await sync([workout()]);
      const sessions = await db.query<{ id: string }>(
        'SELECT id FROM exercise_preset_entries WHERE user_id = $1',
        [userId]
      );
      expect(new Set(sessions.rows.map((session) => session.id))).toEqual(
        new Set([original[0]!.exercise_preset_entry_id, legacyId])
      );
      if (remainingData === 'activity detail') {
        const details =
          await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
            userId,
            null,
            legacyId
          );
        expect(details).toEqual([
          expect.objectContaining({
            detail_data: { note: 'Keep the original session detail' },
          }),
        ]);
      }
    }
  );

  it('rolls back a failed workout write without changing earlier diary data', async () => {
    await sync([workout()]);
    const original = await entries();
    const originalSets = await sets();
    const changed = workout();
    changed.exercises![0]!.sets![0]!.weight_kg = 55;
    vi.spyOn(
      activityDetailsRepository,
      '_createActivityDetailWithClient'
    ).mockRejectedValueOnce(new Error('Synthetic detail write failure'));

    await expect(sync([changed])).rejects.toThrow('Failed to import');

    expect(await entries()).toEqual(original);
    expect(await sets()).toEqual(originalSets);
  });

  it('does not delete another workout between the imported dates', async () => {
    const first = workout('first', '2026-11-01T17:00:00Z');
    const last = workout('last', '2026-11-03T17:00:00Z');
    await sync([first, workout('middle', '2026-11-02T17:00:00Z'), last]);
    const original = await entries();

    await sync([first, last]);

    expect((await entries()).map((row) => row.id)).toEqual(
      original.map((row) => row.id)
    );
  });

  it('serializes concurrent imports of the same workout without duplicate sessions', async () => {
    await Promise.all([sync([workout()]), sync([workout()])]);

    const rows = await entries();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.exercise_preset_entry_id)).size).toBe(
      1
    );
    const sessions = await db.query(
      'SELECT id FROM exercise_preset_entries WHERE user_id = $1',
      [userId]
    );
    expect(sessions.rows).toHaveLength(1);
  });

  it('completes a new import when only one app-pool connection is available', async () => {
    const pool: pg.Pool = getRawAppPool();
    const occupied: pg.PoolClient[] = [];
    try {
      for (let index = 1; index < pool.options.max!; index++) {
        occupied.push(await getClient(userId, userId));
      }
      await expect(sync([workout()])).resolves.toBeUndefined();
      expect(await entries()).toHaveLength(2);
    } finally {
      for (const client of occupied) client.release();
    }
  });

  it('keeps the surviving repeated exercise when Hevy removes its distinguishable first occurrence', async () => {
    const repeated = workout();
    const first = repeated.exercises![0]!;
    const second = {
      ...first,
      index: 1,
      sets: first.sets!.map((set) => ({ ...set, reps: 12 })),
    };
    repeated.exercises = [first, second];
    await sync([repeated]);
    const original = await entries();
    const survivor = original[1]!;
    await db.query(
      `UPDATE exercise_entries SET notes = 'Keep survivor', calories_burned = 225,
      manual_fields = ARRAY['notes', 'calories_burned'] WHERE id = $1`,
      [survivor.id]
    );
    await sync([{ ...repeated, exercises: [{ ...second, index: 0 }] }]);
    expect(await entries()).toEqual([
      expect.objectContaining({
        id: survivor.id,
        notes: 'Keep survivor',
        calories_burned: 225,
      }),
    ]);
  });

  it('rolls back an indistinguishable repeated-exercise removal instead of transferring corrections', async () => {
    const repeated = workout();
    const first = repeated.exercises![0]!;
    repeated.exercises = [first, { ...first, index: 1 }];
    await sync([repeated]);
    const original = await entries();
    await db.query(
      'UPDATE exercise_entries SET notes = $2, manual_fields = $3::text[] WHERE id = $1',
      [original[1]!.id, 'Do not transfer', ['notes']]
    );
    const before = await entries();
    await expect(sync([{ ...repeated, exercises: [first] }])).rejects.toThrow(
      'Failed to import'
    );
    expect(await entries()).toEqual(before);
  });

  it('recovers an ambiguous removal by deleting and re-importing the local session', async () => {
    const repeated = workout();
    const first = repeated.exercises![0]!;
    repeated.exercises = [first, { ...first, index: 1 }];
    await sync([repeated]);
    const original = await entries();
    await updateExerciseEntry(userId, userId, original[1]!.id, {
      notes: 'Local correction to restore after recovery',
    });
    const health = await addHealthSession();
    await setCalorieLink(userId, userId, original[0]!.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });
    const before = await entries();
    const current = { ...repeated, exercises: [first] };
    await expect(sync([current])).rejects.toThrow('Failed to import');
    expect(await entries()).toEqual(before);
    expect(await countedCalories()).toBe(350);

    await exercisePresetEntryRepository.deleteExercisePresetEntry(
      original[0]!.exercise_preset_entry_id,
      userId
    );
    expect((await entries()).map((entry) => entry.id)).toEqual([health.id]);
    expect(await countedCalories()).toBe(400);

    await sync([current]);
    const recovered = (await entries()).filter(
      (entry) => entry.id !== health.id
    );
    expect(recovered).toHaveLength(1);
    expect(original.map((entry) => entry.id)).not.toContain(recovered[0]!.id);
    expect(recovered[0]!.notes).not.toBe(
      'Local correction to restore after recovery'
    );
    const healthLink = await db.query<{ calorie_link_id: string | null }>(
      'SELECT calorie_link_id FROM exercise_entries WHERE id = $1',
      [health.id]
    );
    expect(healthLink.rows).toEqual([{ calorie_link_id: null }]);

    await updateExerciseEntry(userId, userId, recovered[0]!.id, {
      notes: 'Local correction to restore after recovery',
    });
    await setCalorieLink(userId, userId, recovered[0]!.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });
    expect(await countedCalories()).toBe(350);
    expect(
      (await entries()).find((entry) => entry.id === recovered[0]!.id)!.notes
    ).toBe('Local correction to restore after recovery');
  });

  it('retains repeated occurrences when provider edits overlap another occurrence signature', async () => {
    const repeated = workout();
    const first = repeated.exercises![0]!;
    repeated.exercises = [
      first,
      {
        ...first,
        index: 1,
        sets: first.sets!.map((set) => ({ ...set, reps: 12 })),
      },
    ];
    await sync([repeated]);
    for (const [index, entry] of (await entries()).entries()) {
      await updateExerciseEntry(userId, userId, entry.id, {
        notes: `Correction for occurrence ${index}`,
      });
    }
    const before = await entries();
    const beforeSets = await sets();
    const edited = {
      ...repeated,
      exercises: repeated.exercises.map((exercise, index) => ({
        ...exercise,
        sets: exercise.sets!.map((set) => ({
          ...set,
          reps: index === 0 ? 12 : 15,
        })),
      })),
    };

    await expect(sync([edited])).rejects.toThrow('Failed to import');
    expect(await entries()).toEqual(before);
    expect(await sets()).toEqual(beforeSets);
  });

  it.each([
    { reps: [10, 12], originalOrder: [0, 1] },
    { reps: [12, 8], originalOrder: [1, 0] },
  ])(
    'accepts distinguishable repeated-exercise edits or a complete reorder: $reps',
    async ({ reps, originalOrder }) => {
      const repeated = workout();
      const first = repeated.exercises![0]!;
      repeated.exercises = [
        first,
        {
          ...first,
          index: 1,
          sets: first.sets!.map((set) => ({ ...set, reps: 12 })),
        },
      ];
      await sync([repeated]);
      const original = await entries();
      const changed = {
        ...repeated,
        exercises: repeated.exercises.map((exercise, index) => ({
          ...exercise,
          sets: exercise.sets!.map((set) => ({ ...set, reps: reps[index]! })),
        })),
      };
      await sync([changed]);
      const saved = await db.query<{ id: string; reps: number }>(
        `SELECT e.id, s.reps FROM exercise_entries e
         JOIN exercise_entry_sets s ON s.exercise_entry_id = e.id
         WHERE e.user_id = $1 ORDER BY e.sort_order, s.set_number`,
        [userId]
      );
      expect(saved.rows).toEqual(
        originalOrder.map((originalIndex, index) => ({
          id: original[originalIndex]!.id,
          reps: reps[index],
        }))
      );
    }
  );

  it('completes metadata sync and history deletion without a lock-order cycle', async () => {
    const imported = workout();
    await sync([imported]);
    const original = await entries();
    const target = original[0]!;
    const library = await db.query<{ exercise_id: string }>(
      'SELECT exercise_id FROM exercise_entries WHERE id = $1',
      [target.id]
    );
    const fillMuscles = hevyExerciseRepository.fillMissingMuscles;
    const lockParticipants =
      calorieLinkService.lockCalorieLinkParticipantsWithClient;
    let releasePreparation!: () => void;
    let signalMetadata!: () => void;
    let signalDeletion!: (pid: number) => void;
    const preparationReleased = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const metadataWritten = new Promise<void>((resolve) => {
      signalMetadata = resolve;
    });
    const deletionStarted = new Promise<number>((resolve) => {
      signalDeletion = resolve;
    });
    vi.spyOn(
      hevyExerciseRepository,
      'fillMissingMuscles'
    ).mockImplementationOnce(async (...args) => {
      await fillMuscles(...args);
      signalMetadata();
      await preparationReleased;
    });
    vi.spyOn(
      calorieLinkService,
      'lockCalorieLinkParticipantsWithClient'
    ).mockImplementation(async (client, ownerId, ids) => {
      if (ids.length === 1 && ids[0] === target.id) {
        const backend = await client.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid'
        );
        signalDeletion(backend.rows[0]!.pid);
      }
      await lockParticipants(client, ownerId, ids);
    });
    const importing = Promise.allSettled([
      processHevyWorkouts(userId, userId, [imported], 'Europe/Berlin', [
        { id: 'synthetic-bench', primary_muscle_group: 'chest' },
      ]),
    ]);
    let deletion: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await metadataWritten;
      deletion = Promise.allSettled([
        exerciseRepository.deleteExerciseAndDependencies(
          library.rows[0]!.exercise_id,
          userId,
          undefined,
          { deleteHistory: true }
        ),
      ]);
      const deletingPid = await deletionStarted;
      await vi.waitFor(async () => {
        const blocked = await db.query<{ waiting: boolean }>(
          'SELECT cardinality(pg_blocking_pids($1)) > 0 AS waiting',
          [deletingPid]
        );
        expect(blocked.rows[0]!.waiting).toBe(true);
      });
    } finally {
      releasePreparation();
      const outcomes = (
        await Promise.all([importing, ...(deletion ? [deletion] : [])])
      ).flat();
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
    }
    expect((await entries()).map((entry) => entry.id)).toEqual([
      original[1]!.id,
    ]);
  });

  it('deletes grouped Hevy history and its empty UUID session when explicitly requested', async () => {
    const imported = workout();
    imported.exercises = [imported.exercises![0]!];
    await sync([imported]);
    const original = (await entries())[0]!;
    const library = await db.query<{ exercise_id: string }>(
      'SELECT exercise_id FROM exercise_entries WHERE id = $1',
      [original.id]
    );
    await expect(
      exerciseRepository.deleteExerciseAndDependencies(
        library.rows[0]!.exercise_id,
        userId,
        undefined,
        { deleteHistory: true }
      )
    ).resolves.toEqual({ success: true, deletedEntries: 1 });
    expect(await entries()).toEqual([]);
    const sessions = await db.query<{ id: string }>(
      'SELECT id FROM exercise_preset_entries WHERE user_id = $1',
      [userId]
    );
    expect(sessions.rows).toEqual([]);
  });

  it.each([false, true])(
    'retains deleted-library template identities during an older replay (same title: %s)',
    async (sameTitle) => {
      const imported = workout();
      if (sameTitle)
        imported.exercises = imported.exercises!.map((exercise) => ({
          ...exercise,
          title: 'Synthetic shared title',
        }));
      await sync([imported]);
      const original = await entries();
      for (const [index, row] of original.entries()) {
        await db.query(
          'UPDATE exercise_entries SET notes = $2, manual_fields = $3::text[] WHERE id = $1',
          [row.id, `Preserved ${index}`, ['notes']]
        );
      }
      await db.query('DELETE FROM exercises WHERE user_id = $1', [userId]);
      const older = {
        ...imported,
        exercises: [...imported.exercises!]
          .reverse()
          .map((exercise, index) => ({
            ...exercise,
            index,
            exercise_template_id: null,
          })),
      };
      const providerExercises = async () =>
        (
          await db.query<{ id: string; reps: number }>(
            `SELECT e.id, (d.detail_data #>> '{exercise,sets,0,reps}')::int AS reps
             FROM exercise_entries e
             JOIN exercise_entry_activity_details d ON d.exercise_entry_id = e.id
             WHERE e.user_id = $1 AND d.provider_name = 'Hevy'
               AND d.detail_type = 'full_activity_data'
             ORDER BY e.source_id`,
            [userId]
          )
        ).rows;
      const expectedProviderExercises = original.map((row, index) => ({
        id: row.id,
        reps: index === 0 ? 8 : 10,
      }));
      for (let replay = 0; replay < 2; replay++) {
        await sync([older]);
        expect(await providerExercises()).toEqual(expectedProviderExercises);
        const saved = await entries();
        expect(saved.map((row) => row.id)).toEqual(
          original.map((row) => row.id)
        );
        for (const [index, row] of original.entries())
          expect(saved.find((entry) => entry.id === row.id)?.notes).toBe(
            `Preserved ${index}`
          );
      }
      await sync([imported]);
      const saved = await entries();
      expect(new Set(saved.map((row) => row.id))).toEqual(
        new Set(original.map((row) => row.id))
      );
      for (const [index, row] of original.entries())
        expect(saved.find((entry) => entry.id === row.id)?.notes).toBe(
          `Preserved ${index}`
        );
    }
  );

  it('does not merge same-title templates when an older replay cannot distinguish them', async () => {
    const imported = workout();
    const first = {
      ...imported.exercises![0]!,
      title: 'Synthetic shared title',
    };
    imported.exercises = [
      first,
      { ...first, index: 1, exercise_template_id: 'synthetic-other-template' },
    ];
    await sync([imported]);
    const before = await entries();
    await db.query('DELETE FROM exercises WHERE user_id = $1', [userId]);
    const older = {
      ...imported,
      exercises: imported.exercises.map((exercise) => ({
        ...exercise,
        exercise_template_id: null,
      })),
    };
    await expect(sync([older])).rejects.toThrow('Failed to import');
    expect(await entries()).toEqual(before);
  });

  it.each([null, 55])(
    'retains untimed allocation when a timed exercise moves first (watch: %s)',
    async (watchMinutes) => {
      const imported = workout();
      imported.exercises![1]!.sets = imported.exercises![1]!.sets!.map(
        (set) => ({ ...set, duration_seconds: 180 })
      );
      await sync([imported]);
      const original = await entries();
      const bench = original.find(
        (row) => row.exercise_name === 'Synthetic bench press'
      )!;
      if (watchMinutes !== null)
        await db.query(
          'UPDATE exercise_entries SET duration_minutes = $2, watch_duration_minutes = $2 WHERE id = $1',
          [bench.id, watchMinutes]
        );
      await sync([
        {
          ...imported,
          exercises: [...imported.exercises!]
            .reverse()
            .map((exercise, index) => ({ ...exercise, index })),
        },
      ]);
      const duration = await db.query<{ total: number }>(
        'SELECT sum(duration_minutes)::float8 AS total FROM exercise_entries WHERE user_id = $1',
        [userId]
      );
      expect(duration.rows[0]!.total).toBe((watchMinutes ?? 60) + 3);
    }
  );

  it('keeps the original duration owner when a second exercise was corrected back to zero', async () => {
    await sync([workout()]);
    const rows = await entries();
    const second = rows.find((row) => row.exercise_name === 'Synthetic row')!;
    await updateExerciseEntry(userId, userId, second.id, {
      duration_minutes: 10,
    });
    await updateExerciseEntry(userId, userId, second.id, {
      duration_minutes: 0,
    });
    await sync([workout()]);
    const duration = await db.query<{ total: number }>(
      'SELECT sum(duration_minutes)::float8 AS total FROM exercise_entries WHERE user_id = $1',
      [userId]
    );
    expect(duration.rows[0]!.total).toBe(60);
  });

  it('retains deleted-library snapshot metadata rather than applying replacement defaults', async () => {
    const imported = workout();
    imported.exercises = imported.exercises!.map((exercise) => ({
      ...exercise,
      exercise_template_id: null,
    }));
    await sync([imported]);
    const original = await entries();
    const bench = original.find(
      (row) => row.exercise_name === 'Synthetic bench press'
    )!;
    await db.query(
      `UPDATE exercise_entries SET equipment = '["Barbell"]', primary_muscles = '["Chest"]',
      instructions = '["Preserved instruction"]', category = 'Strength' WHERE id = $1`,
      [bench.id]
    );
    const readSnapshot = async () =>
      (
        await db.query(
          'SELECT exercise_name, equipment, primary_muscles, instructions, category, modality FROM exercise_entries WHERE id = $1',
          [bench.id]
        )
      ).rows[0];
    const before = await readSnapshot();
    await db.query(
      "DELETE FROM exercises WHERE user_id = $1 AND name = 'Synthetic bench press'",
      [userId]
    );
    await sync([imported]);
    expect(await readSnapshot()).toEqual(before);
  });

  it('keeps locally edited sets while other Hevy exercise sets still update', async () => {
    await sync([workout()]);
    const original = await entries();
    const bench = original.find(
      (row) => row.exercise_name === 'Synthetic bench press'
    )!;
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [{ set_number: 1, set_type: 'Working Set', reps: 9, weight: 55 }],
    });
    const changed = workout();
    changed.exercises![1]!.sets![0]!.weight_kg = 25;
    await sync([changed]);
    const saved = await sets();
    expect(
      saved.find((row) => row.source_id === bench.source_id)
    ).toMatchObject({ weight: 55, reps: 9 });
    expect(
      saved.find((row) => row.source_id !== bench.source_id)
    ).toMatchObject({ weight: 25 });
  });

  it('does not freeze sets when an entry save re-sends unchanged sets', async () => {
    await sync([workout()]);
    const bench = (await entries()).find(
      (row) => row.exercise_name === 'Synthetic bench press'
    )!;
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [
        { set_number: 1, set_type: 'Working Set', reps: 8, weight: 40, rpe: 7 },
      ],
    });
    const changed = workout();
    changed.exercises![0]!.sets![0]!.weight_kg = 45;
    await sync([changed]);
    expect(
      (await sets()).find((row) => row.source_id === bench.source_id)
    ).toMatchObject({ weight: 45 });
  });

  it.each([undefined, 'stale-client-id'])(
    'keeps omitted set fields on an unchanged save without freezing provider updates (id: %s)',
    async (id) => {
      await sync([workout()]);
      const bench = (await entries()).find(
        (entry) => entry.exercise_name === 'Synthetic bench press'
      )!;
      await updateExerciseEntry(userId, userId, bench.id, {
        sets: [{ id, set_number: 1, weight: 40, reps: 8, rpe: 7 }],
      });
      const saved = await sets();
      expect(
        saved.find((set) => set.source_id === bench.source_id)
      ).toMatchObject({
        set_type: 'Working Set',
        weight: 40,
        reps: 8,
      });
      const changed = workout();
      changed.exercises![0]!.sets![0]!.weight_kg = 45;
      await sync([changed]);
      expect(
        (await sets()).find((set) => set.source_id === bench.source_id)
      ).toMatchObject({ set_type: 'Working Set', weight: 45, reps: 8 });
    }
  );

  it('preserves omitted stored fields when a sparse set edit changes reps', async () => {
    await sync([workout()]);
    const bench = (await entries()).find(
      (entry) => entry.exercise_name === 'Synthetic bench press'
    )!;
    await db.query(
      `UPDATE exercise_entry_sets SET rest_time = 90, notes = $2, distance = 2.5,
         completed_at = $3, is_pr = true WHERE exercise_entry_id = $1`,
      [bench.id, 'Preserved set note', '2026-11-01T17:00:00Z']
    );
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [{ set_number: 1, reps: 9 }],
    });
    await sync([workout()]);
    const saved = await db.query(
      `SELECT set_type, reps, weight::float8 AS weight, rpe::float8 AS rpe,
         rest_time::float8 AS rest_time, notes, distance::float8 AS distance,
         completed_at, is_pr FROM exercise_entry_sets WHERE exercise_entry_id = $1`,
      [bench.id]
    );
    expect(saved.rows).toEqual([
      {
        set_type: 'Working Set',
        reps: 9,
        weight: 40,
        rpe: 7,
        rest_time: 90,
        notes: 'Preserved set note',
        distance: 2.5,
        completed_at: new Date('2026-11-01T17:00:00Z'),
        is_pr: true,
      },
    ]);
  });

  it('retains explicit null set fields instead of treating them as omitted', async () => {
    await sync([workout()]);
    const bench = (await entries()).find(
      (entry) => entry.exercise_name === 'Synthetic bench press'
    )!;
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [{ set_number: 1, set_type: null, weight: null, reps: 8 }],
    });
    await sync([workout()]);
    expect(
      (await sets()).find((set) => set.source_id === bench.source_id)
    ).toMatchObject({ set_type: null, weight: null, reps: 8 });
  });

  it('keeps the fields of an identified set when its number changes', async () => {
    await sync([workout()]);
    const bench = (await entries()).find(
      (entry) => entry.exercise_name === 'Synthetic bench press'
    )!;
    const originalSet = await db.query<{ id: number }>(
      'SELECT id FROM exercise_entry_sets WHERE exercise_entry_id = $1',
      [bench.id]
    );
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [{ id: originalSet.rows[0]!.id, set_number: 2 }],
    });
    await sync([workout()]);
    expect(
      (await sets()).find((set) => set.source_id === bench.source_id)
    ).toMatchObject({
      set_number: 2,
      set_type: 'Working Set',
      weight: 40,
      reps: 8,
    });
  });

  it('does not duplicate a moved set into a new ID-less set on save', async () => {
    const imported = workout();
    imported.exercises![0]!.sets!.push({
      ...imported.exercises![0]!.sets![0]!,
      index: 1,
      weight_kg: 80,
    });
    await sync([imported]);
    const bench = (await entries()).find(
      (entry) => entry.exercise_name === 'Synthetic bench press'
    )!;
    const moved = await db.query<{ id: number }>(
      'SELECT id FROM exercise_entry_sets WHERE exercise_entry_id = $1 AND set_number = 2',
      [bench.id]
    );
    await updateExerciseEntry(userId, userId, bench.id, {
      sets: [
        { set_number: 2, reps: 9 },
        { id: moved.rows[0]!.id, set_number: 1, reps: 8 },
      ],
    });
    await sync([imported]);
    expect(
      (await sets()).filter((set) => set.source_id === bench.source_id)
    ).toMatchObject([
      { set_number: 1, weight: 80, reps: 8 },
      { set_number: 2, weight: null, reps: 9, set_type: null },
    ]);
  });

  it('estimates calories from the sets preserved after a concurrent edit', async () => {
    const imported = workout();
    imported.exercises![0]!.sets!.push({
      ...imported.exercises![0]!.sets![0]!,
      index: 1,
    });
    await sync([imported]);
    const bench = (await entries()).find(
      (entry) => entry.exercise_name === 'Synthetic bench press'
    )!;
    await db.query(
      `UPDATE exercises SET category = 'strength', level = 'intermediate'
       WHERE id = (SELECT exercise_id FROM exercise_entries WHERE id = $1)`,
      [bench.id]
    );
    const readEntry = exerciseEntryRepository.getExerciseEntryById;
    let releaseRead!: () => void;
    let signalRead!: () => void;
    const readFinished = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    const continueEdit = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    vi.spyOn(
      exerciseEntryRepository,
      'getExerciseEntryById'
    ).mockImplementationOnce(async (...args: Parameters<typeof readEntry>) => {
      const snapshot = await readEntry(...args);
      signalRead();
      await continueEdit;
      return snapshot;
    });
    const save = updateExerciseEntry(userId, userId, bench.id, {
      duration_minutes: 30,
      sets: [
        { set_number: 1, reps: 8 },
        { set_number: 2, reps: 8 },
      ],
    });
    try {
      await readFinished;
      // A separate committed write lands after the service's first read.
      await db.query(
        'UPDATE exercise_entry_sets SET weight = 10 WHERE exercise_entry_id = $1 AND set_number = 1',
        [bench.id]
      );
    } finally {
      releaseRead();
    }
    await save;
    expect(
      (await sets()).filter((set) => set.source_id === bench.source_id)
    ).toMatchObject([
      { set_number: 1, weight: 10, reps: 8 },
      { set_number: 2, weight: 40, reps: 8 },
    ]);
    const saved = await db.query<{ calories_burned: number }>(
      'SELECT calories_burned::float8 AS calories_burned FROM exercise_entries WHERE id = $1',
      [bench.id]
    );
    // (10 + 40)/2 divided by 40/(1.0278 - .0278*8) is .503: MET3.5.
    // At the default 70 kg that is 257 kcal/hour, or 128.5 kcal in 30 minutes.
    expect(saved.rows[0]!.calories_burned).toBe(128.5);
  });

  it.each([
    { distance: undefined, expected: 2.5 },
    { distance: 7.5, expected: 7.5 },
    { distance: null, expected: null },
  ])(
    'retains edited set distance and the aggregate override $distance after re-sync',
    async ({ distance, expected }) => {
      const imported = workout();
      imported.exercises![0]!.sets![0]!.distance_meters = 1000;
      await sync([imported]);
      const bench = (await entries()).find(
        (entry) => entry.exercise_name === 'Synthetic bench press'
      )!;
      await updateExerciseEntry(userId, userId, bench.id, {
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 8,
            weight: 40,
            distance: 2.5,
          },
        ],
        distance,
      });
      imported.exercises![0]!.sets![0]!.distance_meters = 2000;
      await sync([imported]);
      const saved = await db.query<{
        distance: number | null;
        set_distance: number;
      }>(
        `SELECT e.distance::float8 AS distance, s.distance::float8 AS set_distance
         FROM exercise_entries e
         JOIN exercise_entry_sets s ON s.exercise_entry_id = e.id
         WHERE e.id = $1`,
        [bench.id]
      );
      expect(saved.rows).toEqual([{ distance: expected, set_distance: 2.5 }]);
    }
  );

  it('allocates untimed workout duration once after a corrected exercise is reordered', async () => {
    await sync([workout()]);
    const original = await entries();
    const bench = original.find(
      (row) => row.exercise_name === 'Synthetic bench press'
    )!;
    await db.query(
      `UPDATE exercise_entries SET duration_minutes = 50,
         manual_fields = ARRAY['duration_minutes'] WHERE id = $1`,
      [bench.id]
    );
    const changed = workout();
    changed.exercises = [...changed.exercises!]
      .reverse()
      .map((exercise, index) => ({ ...exercise, index }));
    await sync([changed]);
    const durations = await db.query<{ id: string; duration: number }>(
      'SELECT id, duration_minutes::float8 AS duration FROM exercise_entries WHERE user_id = $1',
      [userId]
    );
    expect(durations.rows.find((row) => row.id === bench.id)?.duration).toBe(
      50
    );
    expect(durations.rows.reduce((sum, row) => sum + row.duration, 0)).toBe(50);
  });

  it('preserves template-less diary snapshots after library deletion and reordering repeated exercises', async () => {
    const templateLess = workout();
    templateLess.exercises = [
      ...templateLess.exercises!,
      { ...templateLess.exercises![0]!, index: 2 },
    ].map((exercise) => ({ ...exercise, exercise_template_id: null }));
    await sync([templateLess]);
    const original = await entries();
    for (const [index, row] of original.entries()) {
      await db.query(
        `UPDATE exercise_entries SET calories_burned = $2, notes = $3,
           manual_fields = ARRAY['calories_burned', 'notes'] WHERE id = $1`,
        [row.id, 100 + index, `Keep correction ${index}`]
      );
    }
    await db.query(
      "DELETE FROM exercises WHERE user_id = $1 AND name = 'Synthetic bench press'",
      [userId]
    );
    const reordered = {
      ...templateLess,
      exercises: [
        templateLess.exercises![1]!,
        templateLess.exercises![0]!,
        templateLess.exercises![2]!,
      ].map((exercise, index) => ({ ...exercise, index })),
    };
    await sync([reordered]);
    await sync([reordered]);
    const saved = await entries();
    expect(new Set(saved.map((row) => row.id))).toEqual(
      new Set(original.map((row) => row.id))
    );
    for (const [index, row] of original.entries()) {
      expect(saved.find((entry) => entry.id === row.id)).toMatchObject({
        calories_burned: 100 + index,
        notes: `Keep correction ${index}`,
      });
    }
  });

  it.each(['Health Connect', 'HealthKit'])(
    'clears a %s link committed while cleanup waits before deleting a missing recording',
    async (source) => {
      await sync([workout()]);
      const hevy = await entries();
      const health = await ingestHealthSession(source);
      const lockParticipants =
        calorieLinkService.lockCalorieLinkParticipantsWithClient;
      let linkedDuringCleanup = false;
      vi.spyOn(
        calorieLinkService,
        'lockCalorieLinkParticipantsWithClient'
      ).mockImplementationOnce(async (client, ownerId, entryIds) => {
        expect(entryIds).toContain(health.id);
        await setCalorieLink(userId, userId, hevy[0]!.id, {
          synced_entry_id: health.id,
          resolution: 'custom',
          custom_calories: 350,
        });
        linkedDuringCleanup = true;
        await lockParticipants(client, ownerId, entryIds);
      });
      await ingestHealthSession(source, 'synthetic-other-session', 50);
      expect(linkedDuringCleanup).toBe(true);
      expect(await countedCalories()).toBe(50);
      const saved = await db.query<{ calorie_link_id: string | null }>(
        'SELECT calorie_link_id FROM exercise_entries WHERE id = $1',
        [health.id]
      );
      expect(saved.rows).toEqual([]);
    }
  );

  it.each(['Health Connect', 'HealthKit'])(
    'removes a linked %s recording absent from the next complete same-day read',
    async (source) => {
      await sync([workout()]);
      const hevy = await entries();
      const health = await ingestHealthSession(source);
      await setCalorieLink(userId, userId, hevy[0]!.id, {
        synced_entry_id: health.id,
        resolution: 'custom',
        custom_calories: 350,
      });
      await ingestHealthSession(source, 'synthetic-other-session', 50);
      expect(await countedCalories()).toBe(50);
      const linked = await db.query<{ calorie_link_id: string | null }>(
        'SELECT calorie_link_id FROM exercise_entries WHERE id = $1',
        [health.id]
      );
      expect(linked.rows).toEqual([]);
      expect(
        (
          await db.query(
            "SELECT calorie_link_id, calories_applied FROM exercise_entries WHERE user_id = $1 AND source = 'Hevy'",
            [userId]
          )
        ).rows.every(
          (row) => row.calorie_link_id === null && row.calories_applied === null
        )
      ).toBe(true);
    }
  );

  it('keeps each exercise and its corrections together when Hevy reorders exercises', async () => {
    await sync([workout()]);
    const original = await entries();
    const bench = original.find(
      (row) => row.exercise_name === 'Synthetic bench press'
    )!;
    await db.query(
      `UPDATE exercise_entries SET calories_burned = 225,
         notes = 'Bench correction', manual_fields = ARRAY['calories_burned', 'notes']
       WHERE id = $1`,
      [bench.id]
    );
    const changed = workout();
    const [first, second] = changed.exercises!;
    changed.exercises = [
      { ...second!, index: 0 },
      { ...first!, index: 1 },
    ];

    await sync([changed]);
    expect((await entries()).find((row) => row.id === bench.id)).toMatchObject({
      exercise_name: 'Synthetic bench press',
      calories_burned: 225,
      notes: 'Bench correction',
    });
    expect(new Set((await entries()).map((row) => row.id))).toEqual(
      new Set(original.map((row) => row.id))
    );
    await sync([changed]);
    expect((await entries()).find((row) => row.id === bench.id)).toMatchObject({
      exercise_name: 'Synthetic bench press',
      calories_burned: 225,
      notes: 'Bench correction',
    });
  });

  it('restores a locally deleted duplicate exercise without collapsing the two occurrences', async () => {
    const repeated = workout();
    const bench = repeated.exercises![0]!;
    repeated.exercises = [
      bench,
      {
        ...bench,
        index: 1,
        sets: bench.sets!.map((set) => ({ ...set, reps: 12 })),
      },
    ];
    await sync([repeated]);
    const original = await entries();
    await exerciseEntryRepository.deleteExerciseEntry(original[0]!.id, userId);

    await sync([repeated]);

    const restored = await entries();
    expect(restored).toHaveLength(2);
    expect(new Set(restored.map((row) => row.id)).size).toBe(2);
    expect(new Set(restored.map((row) => row.source_id)).size).toBe(2);
    expect((await sets()).map((set) => set.reps)).toEqual([8, 12]);
    expect(restored.some((row) => row.id === original[1]!.id)).toBe(true);
  });

  it.each(
    (['Health Connect', 'HealthKit'] as const).flatMap((source) =>
      (
        [
          ['sparkyfitness', 0],
          ['synced', 400],
          ['higher', 400],
          ['lower', 0],
          ['average', 200],
          ['custom', 350],
        ] as const
      ).map(([resolution, expected]) => ({ source, resolution, expected }))
    )
  )(
    'retains the $source $resolution link and counts $expected calories after both providers sync again',
    async ({ source, resolution, expected }) => {
      await sync([workout()]);
      const hevy = await entries();
      const health = await ingestHealthSession(source);
      await setCalorieLink(userId, userId, hevy[0]!.id, {
        synced_entry_id: health.id,
        resolution,
        ...(resolution === 'custom' ? { custom_calories: 350 } : {}),
      });

      await sync([workout()]);
      const resynced = await ingestHealthSession(source);
      expect(resynced.id).toBe(health.id);

      expect(await countedCalories()).toBe(expected);
      const linked = await db.query(
        'SELECT calorie_link_id FROM exercise_entries WHERE user_id = $1',
        [userId]
      );
      expect(linked.rows).toHaveLength(3);
      expect(linked.rows.every((row) => row.calorie_link_id)).toBe(true);
      expect(new Set(linked.rows.map((row) => row.calorie_link_id)).size).toBe(
        1
      );
      await clearCalorieLink(userId, userId, hevy[0]!.id);
      expect(await countedCalories()).toBe(400);
    }
  );

  it('keeps a custom total as exercises are removed and added, and restores the device when empty', async () => {
    await sync([workout()]);
    const original = await entries();
    const health = await addHealthSession('HealthKit');
    await setCalorieLink(userId, userId, original[0]!.id, {
      synced_entry_id: health.id,
      resolution: 'custom',
      custom_calories: 350,
    });
    const fewer = workout();
    fewer.exercises = [fewer.exercises![1]!];
    await sync([fewer]);
    expect(await countedCalories()).toBe(350);
    expect(
      (await entries()).find((row) => row.exercise_name === 'Synthetic row')!.id
    ).toBe(original[1]!.id);

    const more = workout();
    more.exercises!.push({ ...more.exercises![0]!, index: 2 });
    await sync([more]);
    expect(await countedCalories()).toBe(350);

    await sync([{ ...workout(), exercises: [] }]);
    expect(await countedCalories()).toBe(400);
    expect(
      (
        await db.query(
          "SELECT id FROM exercise_preset_entries WHERE user_id = $1 AND source = 'Hevy'",
          [userId]
        )
      ).rows
    ).toEqual([]);
    const healthLink = await db.query(
      'SELECT calorie_link_id, calories_applied FROM exercise_entries WHERE id = $1',
      [health.id]
    );
    expect(healthLink.rows[0]).toMatchObject({
      calorie_link_id: null,
      calories_applied: null,
    });
  });
});
