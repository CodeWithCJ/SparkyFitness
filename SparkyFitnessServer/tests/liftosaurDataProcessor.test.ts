import { vi, beforeEach, describe, it, expect } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  },
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    _createExerciseEntryWithClient: vi
      .fn()
      .mockResolvedValue({ entry: { id: 'entry-1' } }),
    deleteExerciseEntriesByEntrySourceAndDateWithClient: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));

vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(name === 'Squat' ? { id: 'exercise-squat' } : null)
      ),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-new' }),
    fillEmptyMuscles: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    _createActivityDetailWithClient: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn().mockResolvedValue(null),
    createWorkoutPreset: vi.fn().mockResolvedValue({ id: 42 }),
    addExerciseToWorkoutPreset: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    createExercisePresetEntryWithClient: vi
      .fn()
      .mockResolvedValue({ id: 'preset-entry-1' }),
    deleteExercisePresetEntriesByEntrySourceAndDateWithClient: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processLiftosaurWorkouts } from '../integrations/liftosaur/liftosaurDataProcessor.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import { getClient } from '../db/poolManager.js';
import { parseLiftohistory } from '../integrations/liftosaur/liftohistoryParser.js';

const UID = 'user-1';
const CID = 'user-1';

function sampleWorkoutText() {
  return [
    '2026-07-13 05:52:14 +00:00 / program: "5/3/1" / dayName: "Squat Day" / week: 1 / dayInWeek: 1 / duration: 3600s / exercises: {',
    '  Squat / 3x5 185lb / warmup: 1x5 95lb / target: 3x5 185lb 120s',
    '  Bulgarian Split Squat / 2x6 20kg',
    '}',
  ].join('\n');
}

function parseSampleWorkouts() {
  return parseLiftohistory(sampleWorkoutText()).workouts;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(mockClient as any);
  // clearAllMocks keeps implementations, so restore the default library.
  vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockImplementation(
    (name: string) =>
      Promise.resolve(name === 'Squat' ? { id: 'exercise-squat' } : null) as any
  );
});

describe('processLiftosaurWorkouts', () => {
  it('wraps operations in a transaction with BEGIN, COMMIT, and release', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(getClient).toHaveBeenCalledWith(UID, CID);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back transaction and releases client when an error occurs', async () => {
    const workouts = parseSampleWorkouts();
    vi.mocked(
      exercisePresetEntryRepository.createExercisePresetEntryWithClient
    ).mockRejectedValueOnce(new Error('DB failure'));

    await expect(processLiftosaurWorkouts(UID, CID, workouts)).rejects.toThrow(
      'DB failure'
    );

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('lets getClient failure throw directly', async () => {
    vi.mocked(getClient).mockRejectedValueOnce(
      new Error('Connection pool exhausted')
    );
    const workouts = parseSampleWorkouts();

    await expect(processLiftosaurWorkouts(UID, CID, workouts)).rejects.toThrow(
      'Connection pool exhausted'
    );
  });

  it('clears prior Liftosaur data in the synced date range before rebuilding', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-13',
      '2026-07-13',
      'Liftosaur'
    );
    expect(
      exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-13',
      '2026-07-13',
      'Liftosaur'
    );
  });

  it('creates a workout preset per program name and one preset entry per workout on client', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    // Library rows are written outside the transaction (garminActivityProcessor
    // rule), so these take no client argument.
    expect(workoutPresetRepository.getWorkoutPresetByName).toHaveBeenCalledWith(
      UID,
      '5/3/1'
    );
    expect(workoutPresetRepository.createWorkoutPreset).toHaveBeenCalledWith({
      user_id: UID,
      name: '5/3/1',
      description: 'Workout session from Liftosaur: 5/3/1',
      is_public: false,
    });
    expect(
      exercisePresetEntryRepository.createExercisePresetEntryWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      expect.objectContaining({
        user_id: UID,
        workout_preset_id: 42,
        name: '5/3/1',
        entry_date: '2026-07-13',
        source: 'Liftosaur',
      }),
      CID
    );
  });

  it('finds an existing exercise by full name, then by bare name, then creates custom', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    // "Squat" exists in the mock library.
    expect(exerciseRepository.findExerciseByNameAndUserId).toHaveBeenCalledWith(
      'Squat',
      UID
    );
    // "Bulgarian Split Squat" doesn't exist → create a custom exercise.
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: UID,
        name: 'Bulgarian Split Squat',
        source: 'Liftosaur',
        is_custom: true,
      })
    );
  });

  it('creates new exercises with the muscles the resolver returns, asking only about exercises that need them', async () => {
    const resolveMuscles = vi
      .fn()
      .mockResolvedValue(
        new Map([
          [
            'Bulgarian Split Squat',
            { primary: ['quadriceps'], secondary: ['glutes'] },
          ],
        ])
      );

    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      resolveMuscles
    );

    // "Squat" resolves to a library row the user does not own, so only the
    // new exercise is looked up.
    expect(resolveMuscles).toHaveBeenCalledTimes(1);
    expect(resolveMuscles).toHaveBeenCalledWith(['Bulgarian Split Squat']);
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bulgarian Split Squat',
        primary_muscles: ['quadriceps'],
        secondary_muscles: ['glutes'],
      })
    );
    expect(exerciseRepository.fillEmptyMuscles).not.toHaveBeenCalled();
  });

  it('resolves each exercise once per batch, not once per workout', async () => {
    const [first] = parseSampleWorkouts();
    const workouts = [first!, { ...first!, id: first!.id + 1 }];

    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(exerciseRepository.createExercise).toHaveBeenCalledTimes(1);
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(4);
  });

  it('backfills muscles on an owned exercise that has none', async () => {
    vi.mocked(
      exerciseRepository.findExerciseByNameAndUserId
    ).mockImplementation(
      (name: string) =>
        Promise.resolve(
          name === 'Squat'
            ? { id: 'exercise-squat', user_id: UID, primary_muscles: '[]' }
            : null
        ) as any
    );
    const resolveMuscles = vi
      .fn()
      .mockResolvedValue(
        new Map([['Squat', { primary: ['quadriceps'], secondary: ['glutes'] }]])
      );

    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      resolveMuscles
    );

    expect(resolveMuscles).toHaveBeenCalledWith([
      'Squat',
      'Bulgarian Split Squat',
    ]);
    expect(exerciseRepository.fillEmptyMuscles).toHaveBeenCalledWith(
      UID,
      'exercise-squat',
      ['quadriceps'],
      ['glutes']
    );
  });

  it('reuses a row created earlier in the sync for a bare-name alias', async () => {
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      null as never
    );
    vi.mocked(exerciseRepository.createExercise).mockResolvedValueOnce({
      id: 'exercise-squat-new',
    } as never);
    const text = [
      '2026-07-13 05:52:14 +00:00 / exercises: {',
      '  Squat / 3x5 100kg',
      '  Squat, Barbell / 3x5 100kg',
      '}',
    ].join('\n');

    await processLiftosaurWorkouts(UID, CID, parseLiftohistory(text).workouts);

    expect(exerciseRepository.createExercise).toHaveBeenCalledTimes(1);
    const entries = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(entries.map((c) => c[2].exercise_id)).toEqual([
      'exercise-squat-new',
      'exercise-squat-new',
    ]);
  });

  it('makes no muscle lookup when every exercise already has muscles or is not owned', async () => {
    vi.mocked(
      exerciseRepository.findExerciseByNameAndUserId
    ).mockImplementation(
      (name: string) =>
        Promise.resolve(
          name === 'Squat'
            ? {
                id: 'exercise-squat',
                user_id: UID,
                primary_muscles: '["glutes"]',
              }
            : name === 'Bulgarian Split Squat'
              ? { id: 'public-bss', user_id: null, primary_muscles: null }
              : null
        ) as any
    );
    const resolveMuscles = vi.fn();

    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      resolveMuscles
    );

    expect(resolveMuscles).not.toHaveBeenCalled();
    expect(exerciseRepository.fillEmptyMuscles).not.toHaveBeenCalled();
    expect(exerciseRepository.createExercise).not.toHaveBeenCalled();
  });

  it('still imports the workout when the muscle lookup fails', async () => {
    const resolveMuscles = vi.fn().mockRejectedValue(new Error('timeout'));

    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      resolveMuscles
    );

    const created = vi.mocked(exerciseRepository.createExercise).mock
      .calls[0]![0];
    expect(created).not.toHaveProperty('primary_muscles');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(2);
  });

  it('creates exercise entries with merged sets using _createExerciseEntryWithClient', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls).toHaveLength(2);

    // Squat: 1 warmup set + 3 working sets with 120s timer.
    const squatCall = createCalls[0]!;
    expect(squatCall[0]).toBe(mockClient);
    expect(squatCall[1]).toBe(UID);
    expect(squatCall[2]).toMatchObject({
      exercise_id: 'exercise-squat',
      entry_date: '2026-07-13',
      entry_time: '05:52',
      duration_minutes: 60, // the workout's duration: 3600s
      source_id: expect.stringContaining('_0'),
    });
    expect(squatCall[3]).toBe(CID);
    expect(squatCall[4]).toBe('Liftosaur');
    expect(squatCall[5]).toBe('preset-entry-1');

    const squatSets = squatCall[2].sets as Array<Record<string, unknown>>;
    expect(squatSets).toHaveLength(4);
    expect(squatSets[0]).toMatchObject({
      set_number: 1,
      set_type: 'Warm-up',
      weight: 43.09, // 95 lb -> kg
      reps: 5,
    });
    expect(squatSets[1]).toMatchObject({
      set_number: 2,
      set_type: 'Working Set',
      weight: 83.91, // 185 lb -> kg
      reps: 5,
      duration: null, // rest timers are not set durations
      rest_time: 120,
    });

    // Bulgarian Split Squat: 2 sets, no timers; not the first exercise so no
    // whole-workout duration attribution.
    const splitSquatCall = createCalls[1]!;
    expect(splitSquatCall[2]).toMatchObject({
      exercise_id: 'exercise-new',
      duration_minutes: 0,
      source_id: expect.stringContaining('_1'),
    });
  });

  it('attributes whole-workout duration to the first exercise only', async () => {
    const text = [
      '2026-07-14 10:00:00 +00:00 / duration: 3600s / exercises: {',
      '  Squat / 3x5 100kg',
      '  Curl / 3x10 10kg',
      '}',
    ].join('\n');
    const workouts = parseLiftohistory(text).workouts;
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls[0]![2]).toMatchObject({ duration_minutes: 60 });
    expect(createCalls[1]![2]).toMatchObject({ duration_minutes: 0 });
  });

  it('stores a raw activity detail per entry with _createActivityDetailWithClient', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      activityDetailsRepository._createActivityDetailWithClient
    ).toHaveBeenCalledTimes(2);
    const detailCall = vi.mocked(
      activityDetailsRepository._createActivityDetailWithClient
    ).mock.calls[0]!;
    expect(detailCall[0]).toBe(mockClient);
    expect(detailCall[1]).toMatchObject({
      exercise_entry_id: 'entry-1',
      provider_name: 'Liftosaur',
      detail_type: 'full_activity_data',
    });
    expect(detailCall[1].detail_data.workout).toMatchObject({
      id: new Date('2026-07-13T05:52:14Z').getTime(),
      programName: '5/3/1',
      durationSeconds: 3600,
    });
    expect(detailCall[1].detail_data.exercise.name).toBe('Squat');
  });

  it('deduplicates workouts with the same id', async () => {
    const workouts = [...parseSampleWorkouts(), ...parseSampleWorkouts()];
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(2);
  });
});
