import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { processGarminWorkoutDefinition } from '../services/garminService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    updateExercise: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { createExerciseEntry: vi.fn() },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: { createExercisePresetEntry: vi.fn() },
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

function buildWorkoutData(weightUnitKey: string | undefined) {
  return {
    workoutName: 'Strength Plan',
    workoutSegments: [
      {
        workoutSteps: [
          {
            type: 'ExecutableStepDTO',
            exerciseName: 'BENCH_PRESS',
            category: 'BENCH_PRESS',
            stepType: { stepTypeKey: 'Working Set' },
            endConditionValue: 5,
            weightValue: 100,
            ...(weightUnitKey
              ? { weightUnit: { unitKey: weightUnitKey } }
              : {}),
          },
        ],
      },
    ],
  };
}

function capturedSetWeight() {
  const call = vi.mocked(workoutPresetRepository.addExerciseToWorkoutPreset)
    .mock.calls[0];
  // addExerciseToWorkoutPreset(userId, presetId, exerciseId, null, sets, order)
  return call[4][0].weight;
}

describe('processGarminWorkoutDefinition set weights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      {
        id: 'exercise-1',
        name: 'Bench Press',
        category: 'strength',
      }
    );
    vi.mocked(workoutPresetRepository.getWorkoutPresetByName).mockResolvedValue(
      {
        id: 7,
      }
    );
  });

  it('converts pound-denominated step weights to kg', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData('pound'));
    expect(capturedSetWeight()).toBeCloseTo(45.36, 2);
  });

  it('stores kilogram-denominated step weights unchanged', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData('kilogram'));
    expect(capturedSetWeight()).toBe(100);
  });

  it('treats a missing weightUnit as kilograms rather than pounds', async () => {
    await processGarminWorkoutDefinition(UID, buildWorkoutData(undefined));
    expect(capturedSetWeight()).toBe(100);
  });
});
