import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { processGarminWorkoutSession } from '../services/garminService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    updateExercise: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    createActivityDetail: vi.fn(),
  },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    createExercisePresetEntry: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
    createWorkoutPreset: vi.fn(),
    addExerciseToWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../services/measurementService.js', () => ({ default: {} }));
vi.mock('../models/moodRepository.js', () => ({ default: {} }));
vi.mock('../integrations/garminconnect/garminConnectService.js', () => ({
  default: {},
}));
vi.mock('../integrations/garminconnect/garminMeasurementMapping.js', () => ({
  default: {},
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/sleepRepository.js', () => ({ default: {} }));
vi.mock('../models/food.js', () => ({ default: {} }));
vi.mock('../models/foodEntry.js', () => ({ default: {} }));
vi.mock('../models/mealType.js', () => ({ default: {} }));

const UID = 'user-1';

describe('processGarminWorkoutSession set durations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      { id: 'exercise-1', name: 'Bench Press', category: 'strength' }
    );
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
    vi.mocked(
      exercisePresetEntryRepository.createExercisePresetEntry
    ).mockResolvedValue({ id: 'preset-entry-1' });
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      { id: 7 }
    );
  });

  it('stores per-set duration in integer seconds and entry duration in minutes (issue #1903)', async () => {
    await processGarminWorkoutSession(
      UID,
      {
        activity: {
          activityName: 'Morning Strength',
          startTimeLocal: '2026-07-15T10:00:00.0',
          activityId: 555,
          active_calories: 100,
        },
        exercise_sets: {
          exerciseSets: [
            {
              setType: 'ACTIVE',
              duration: 90.4,
              weight: 10000,
              repetitionCount: 5,
              startTime: '2026-07-15T10:00:00.000Z',
              exercises: [{ name: 'BENCH_PRESS', category: 'BENCH_PRESS' }],
            },
          ],
        },
      },
      '2026-07-15',
      '2026-07-15'
    );

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 1.5,
        sets: [
          expect.objectContaining({
            set_number: 1,
            set_type: 'Working Set',
            reps: 5,
            duration: 90,
          }),
        ],
      }),
      UID,
      'garmin',
      'preset-entry-1'
    );
    // The preset definition receives the same seconds-based sets.
    expect(
      workoutPresetRepository.addExerciseToWorkoutPreset
    ).toHaveBeenCalledWith(
      UID,
      7,
      'exercise-1',
      null,
      [expect.objectContaining({ duration: 90 })],
      0
    );
  });
});
