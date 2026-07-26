import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { importExerciseEntriesFromCsv } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/exercise', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    createExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
    createWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({
  default: {
    createActivityDetail: vi.fn(),
  },
}));
vi.mock('../models/preferenceRepository', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

describe('importExerciseEntriesFromCsv set durations', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseRepository.findExerciseByNameAndUserId.mockResolvedValue({
      id: 'exercise-1',
    });
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.createExerciseEntry.mockResolvedValue({
      id: 'entry-1',
    });
    // @ts-expect-error TS(2339): mock method not on typed function.
    preferenceRepository.getUserPreferences.mockResolvedValue({
      default_distance_unit: 'km',
      default_weight_unit: 'kg',
    });
  });

  it('converts fractional duration_min to integer seconds without losing precision (issue #1903)', async () => {
    const result = await importExerciseEntriesFromCsv(userId, userId, [
      {
        entry_date: '2026-07-01',
        exercise_name: 'Plank',
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            duration_min: 1.5,
            rest_time_sec: 60,
          },
        ],
      },
    ]);

    expect(result.created).toBe(1);
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        // 90s duration + 60s rest = 2.5 minutes; the fractional 1.5 min set
        // duration must not be truncated to 1.
        duration_minutes: 2.5,
        sets: [
          expect.objectContaining({
            set_number: 1,
            duration: 90,
            rest_time: 60,
          }),
        ],
      }),
      userId,
      'CSV_Import'
    );
  });

  it('maps a missing duration_min to a null set duration', async () => {
    await importExerciseEntriesFromCsv(userId, userId, [
      {
        entry_date: '2026-07-01',
        exercise_name: 'Bench Press',
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 5,
            weight: 100,
          },
        ],
      },
    ]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        sets: [expect.objectContaining({ duration: null })],
      }),
      userId,
      'CSV_Import'
    );
  });
});
