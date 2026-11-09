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
import { endPool } from '../db/poolManager.js';
import { processHevyWorkouts } from '../integrations/hevy/hevyDataProcessor.js';
import type { HevyWorkout } from '../integrations/hevy/hevyTypes.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
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

  it.each([
    ['sparkyfitness', 0],
    ['synced', 400],
    ['higher', 400],
    ['lower', 0],
    ['average', 200],
    ['custom', 350],
  ] as const)(
    'retains the %s link and counts %i calories after both providers sync again',
    async (resolution, expected) => {
      await sync([workout()]);
      const hevy = await entries();
      const health = await addHealthSession();
      await setCalorieLink(userId, userId, hevy[0]!.id, {
        synced_entry_id: health.id,
        resolution,
        ...(resolution === 'custom' ? { custom_calories: 350 } : {}),
      });

      await sync([workout()]);
      await addHealthSession();

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
