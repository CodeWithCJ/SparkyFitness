import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
    deleteExerciseEntriesByEntrySourceAndDate: vi
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
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    createActivityDetail: vi.fn().mockResolvedValue(undefined),
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
    createExercisePresetEntry: vi
      .fn()
      .mockResolvedValue({ id: 'preset-entry-1' }),
    deleteExercisePresetEntriesByEntrySourceAndDate: vi
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
});

describe('processLiftosaurWorkouts', () => {
  it('clears prior Liftosaur data in the synced date range before rebuilding', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, '2026-07-13', '2026-07-13', 'Liftosaur');
    expect(
      exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, '2026-07-13', '2026-07-13', 'Liftosaur');
  });

  it('creates a workout preset per program name and one preset entry per workout', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

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
      exercisePresetEntryRepository.createExercisePresetEntry
    ).toHaveBeenCalledWith(
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

  it('creates exercise entries with merged sets (warmup, completed, target timers)', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls;
    expect(createCalls).toHaveLength(2);

    // Squat: 1 warmup set + 3 working sets with 120s timer.
    const squatCall = createCalls[0]!;
    expect(squatCall[1]).toMatchObject({
      exercise_id: 'exercise-squat',
      entry_date: '2026-07-13',
      entry_time: '05:52',
      duration_minutes: 6, // 3 * 120s timer
      entry_source: 'Liftosaur',
      exercise_preset_entry_id: 'preset-entry-1',
      source_id: expect.stringContaining('_0'),
      sort_order: 0,
    });
    const squatSets = squatCall[1].sets as Array<Record<string, unknown>>;
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
      duration: 120,
    });

    // Bulgarian Split Squat: 2 sets, no timers; not the first exercise so no
    // whole-workout duration attribution.
    const splitSquatCall = createCalls[1]!;
    expect(splitSquatCall[1]).toMatchObject({
      exercise_id: 'exercise-new',
      duration_minutes: 0,
      source_id: expect.stringContaining('_1'),
    });
  });

  it('attributes whole-workout duration to the first exercise when no timers exist', async () => {
    const text = [
      '2026-07-14 10:00:00 +00:00 / duration: 3600s / exercises: {',
      '  Squat / 3x5 100kg',
      '  Curl / 3x10 10kg',
      '}',
    ].join('\n');
    const workouts = parseLiftohistory(text).workouts;
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls;
    expect(createCalls[0]![1]).toMatchObject({ duration_minutes: 60 });
    expect(createCalls[1]![1]).toMatchObject({ duration_minutes: 0 });
  });

  it('stores a raw activity detail per entry', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      activityDetailsRepository.createActivityDetail
    ).toHaveBeenCalledTimes(2);
    const detailCall = vi.mocked(activityDetailsRepository.createActivityDetail)
      .mock.calls[0]!;
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

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledTimes(
      2
    );
  });
});
