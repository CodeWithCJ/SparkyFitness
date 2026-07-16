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
        Promise.resolve({ id: `exercise-${name}` })
      ),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-new' }),
  },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: { upsertCheckInMeasurements: vi.fn().mockResolvedValue(undefined) },
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

import { processHevyWorkouts } from '../integrations/hevy/hevyDataProcessor.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';

const UID = 'user-1';
const CID = 'user-1';

// A workout with three exercises: two untimed, one with per-set durations.
function sampleWorkout() {
  return {
    id: 'workout-abc',
    title: 'Vid plan A',
    routine_id: 'routine-1',
    description: '',
    start_time: '2026-07-13T05:52:14+00:00',
    end_time: '2026-07-13T06:52:14+00:00', // 60 minutes
    exercises: [
      {
        index: 0,
        title: 'Bulgarian Split Squat',
        notes: '',
        exercise_template_id: 'B5D3A742',
        superset_id: null,
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: 20,
            reps: 6,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
          },
          {
            index: 1,
            type: 'normal',
            weight_kg: 20,
            reps: 8,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
          },
        ],
      },
      {
        index: 1,
        title: 'Pull Up',
        notes: '',
        exercise_template_id: '1B2B1E7C',
        superset_id: 'ss-1',
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: null,
            reps: 6,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
          },
        ],
      },
      {
        index: 2,
        title: 'Plank',
        notes: '',
        exercise_template_id: 'PLANK01',
        superset_id: null,
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: null,
            reps: null,
            duration_seconds: 90,
            distance_meters: null,
            rpe: null,
          },
          {
            index: 1,
            type: 'normal',
            weight_kg: null,
            reps: null,
            duration_seconds: 90,
            distance_meters: null,
            rpe: null,
          },
        ],
      },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callForExercise(name: string): any[] | undefined {
  return (
    exerciseEntryRepository.createExerciseEntry as unknown as {
      mock: { calls: unknown[][] };
    }
  ).mock.calls.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c) => (c[1] as any).exercise_id === `exercise-${name}`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entryArgForExercise(name: string): any {
  return callForExercise(name)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processHevyWorkouts — field mapping', () => {
  it('maps entry_time from the workout start time in the user timezone', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(entryArgForExercise('Bulgarian Split Squat').entry_time).toBe(
      '05:52'
    );
  });

  it('shifts entry_time into a negative-offset timezone', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'America/New_York');
    // 05:52 UTC is 01:52 in New York (EDT, -04:00)
    expect(entryArgForExercise('Bulgarian Split Squat').entry_time).toBe(
      '01:52'
    );
  });

  it('sets a stable per-exercise source_id (workout id + exercise index)', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(entryArgForExercise('Bulgarian Split Squat').source_id).toBe(
      'workout-abc_0'
    );
    expect(entryArgForExercise('Pull Up').source_id).toBe('workout-abc_1');
  });

  it('maps the Hevy superset id to a numeric per-workout group', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(
      entryArgForExercise('Bulgarian Split Squat').superset_group
    ).toBeNull();
    // First distinct superset id in the workout → group 1 (numeric, not the raw id).
    expect(entryArgForExercise('Pull Up').superset_group).toBe(1);
  });

  it('attributes whole-workout duration to the first untimed exercise only', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(entryArgForExercise('Bulgarian Split Squat').duration_minutes).toBe(
      60
    );
    expect(entryArgForExercise('Pull Up').duration_minutes).toBe(0);
  });

  it('uses summed per-set duration for timed exercises', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    // 90 + 90 = 180s → 3 min
    expect(entryArgForExercise('Plank').duration_minutes).toBe(3);
  });
});

describe('processHevyWorkouts — workout-preset grouping', () => {
  it('creates the workout preset by name when missing', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(workoutPresetRepository.getWorkoutPresetByName).toHaveBeenCalledWith(
      UID,
      'Vid plan A'
    );
    expect(workoutPresetRepository.createWorkoutPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: UID,
        name: 'Vid plan A',
        is_public: false,
      })
    );
  });

  it('creates one preset entry (session) for the workout, sourced Hevy', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(
      exercisePresetEntryRepository.createExercisePresetEntry
    ).toHaveBeenCalledTimes(1);
    expect(
      exercisePresetEntryRepository.createExercisePresetEntry
    ).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        workout_preset_id: 42,
        name: 'Vid plan A',
        entry_date: '2026-07-13',
        source: 'Hevy',
      }),
      CID
    );
  });

  it('links every exercise entry to the preset entry (5th arg + field)', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    for (const name of ['Bulgarian Split Squat', 'Pull Up', 'Plank']) {
      const call = callForExercise(name)!;
      expect(call[3]).toBe('Hevy'); // entrySource
      expect(call[4]).toBe('preset-entry-1'); // exercisePresetEntryId (5th arg)
      expect(call[1].exercise_preset_entry_id).toBe('preset-entry-1');
    }
  });

  it('adds each exercise to the workout preset template', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');
    expect(
      workoutPresetRepository.addExerciseToWorkoutPreset
    ).toHaveBeenCalledTimes(3);
    expect(
      workoutPresetRepository.addExerciseToWorkoutPreset
    ).toHaveBeenCalledWith(
      UID,
      42,
      'exercise-Bulgarian Split Squat',
      null,
      expect.any(Array),
      0
    );
  });
});

describe('processHevyWorkouts — duplicate workout guard', () => {
  it('processes a repeated workout id once (no orphan/empty preset entry)', async () => {
    // Same workout twice (mirrors the mock bundle holding page 1 under two keys).
    await processHevyWorkouts(
      UID,
      CID,
      [sampleWorkout(), sampleWorkout()],
      'UTC'
    );
    expect(
      exercisePresetEntryRepository.createExercisePresetEntry
    ).toHaveBeenCalledTimes(1);
    // 3 exercises, not 6.
    expect(
      workoutPresetRepository.addExerciseToWorkoutPreset
    ).toHaveBeenCalledTimes(3);
  });
});

describe('processHevyWorkouts — re-sync cleanup', () => {
  it('clears existing Hevy entries and preset entries over the batch date range', async () => {
    const older = sampleWorkout();
    older.id = 'workout-old';
    older.start_time = '2026-07-08T05:00:00+00:00';
    older.end_time = '2026-07-08T06:00:00+00:00';
    await processHevyWorkouts(UID, CID, [sampleWorkout(), older], 'UTC');

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, '2026-07-08', '2026-07-13', 'Hevy');
    expect(
      exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, '2026-07-08', '2026-07-13', 'Hevy');
  });
});

describe('processHevyWorkouts — raw JSON activity detail', () => {
  it('stores full_activity_data per entry', async () => {
    await processHevyWorkouts(UID, CID, [sampleWorkout()], 'UTC');

    expect(activityDetailsRepository.createActivityDetail).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        exercise_entry_id: 'entry-1',
        provider_name: 'Hevy',
        detail_type: 'full_activity_data',
        detail_data: expect.objectContaining({
          workout: expect.objectContaining({ id: 'workout-abc' }),
          exercise: expect.objectContaining({ title: 'Bulgarian Split Squat' }),
        }),
      })
    );
    // One detail row per exercise
    expect(
      activityDetailsRepository.createActivityDetail
    ).toHaveBeenCalledTimes(3);
  });
});
