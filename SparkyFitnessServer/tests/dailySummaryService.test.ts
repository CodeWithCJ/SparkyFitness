import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ExerciseSessionResponse } from '@workspace/shared';
import { getDailySummary } from '../services/dailySummaryService.js';
import goalService from '../services/goalService.js';
import foodEntryService from '../services/foodEntryService.js';
import { getExerciseEntriesByDateV2 } from '../services/exerciseEntryHistoryService.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import bmrService from '../services/bmrService.js';

vi.mock('../services/goalService.js', () => ({
  default: {
    getUserGoals: vi.fn(),
  },
}));

vi.mock('../services/foodEntryService.js', () => ({
  default: {
    getFoodEntriesByDate: vi.fn(),
  },
}));

vi.mock('../services/exerciseEntryHistoryService.js', () => ({
  getExerciseEntriesByDateV2: vi.fn(),
}));

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getWaterIntakeByDate: vi.fn(),
    getLatestCheckInMeasurementsOnOrBeforeDate: vi.fn(),
    getStepCaloriesForDate: vi.fn(),
  },
}));

vi.mock('../models/userRepository.js', () => ({
  default: {
    getUserProfile: vi.fn(),
  },
}));

vi.mock('../models/preferenceRepository.js', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: vi.fn(),
    ActivityMultiplier: {
      sedentary: 1.2,
      not_much: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      extra_active: 1.9,
    },
  },
  ActivityMultiplier: {
    sedentary: 1.2,
    not_much: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9,
  },
}));

vi.mock('../services/AdaptiveTdeeService.js', () => ({
  default: {
    calculateAdaptiveTdee: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const actorUserId = 'actor-user-id';
const targetUserId = 'target-user-id';
const date = '2024-06-15';

const activeCaloriesSession: ExerciseSessionResponse = {
  type: 'individual',
  id: 'exercise-entry-1',
  exercise_id: 'exercise-1',
  duration_minutes: 30,
  calories_burned: 300,
  entry_date: date,
  notes: null,
  distance: null,
  avg_heart_rate: null,
  source: 'health',
  sets: [],
  exercise_snapshot: null,
  activity_details: [],
  steps: 1000,
  name: 'Active Calories',
};

describe('dailySummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));

    vi.mocked(goalService.getUserGoals).mockResolvedValue({
      calories: 2000,
    });
    vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([
      {
        calories: 500,
        quantity: 100,
        serving_size: 100,
      },
    ]);
    vi.mocked(getExerciseEntriesByDateV2).mockResolvedValue([
      activeCaloriesSession,
    ]);
    vi.mocked(measurementRepository.getWaterIntakeByDate).mockResolvedValue({
      water_ml: 0,
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      weight: 80,
      height: 180,
    });
    vi.mocked(measurementRepository.getStepCaloriesForDate).mockResolvedValue(
      40
    );
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'not_much',
      calorie_goal_adjustment_mode: 'tdee',
      exercise_calorie_percentage: 100,
      include_bmr_in_net_calories: false,
      tdee_allow_negative_adjustment: false,
      timezone: 'UTC',
    });
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns the TDEE projection used for remaining calories', async () => {
    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeCheckin: true,
    });

    expect(result.calorieBalance.tdeeProjection).toEqual({
      projectedBurn: 2400,
      baselineBurn: 2160,
      adjustment: 240,
    });
    expect(result.calorieBalance.remaining).toBe(1740);
  });

  test('returns null projection outside TDEE-style modes', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'not_much',
      calorie_goal_adjustment_mode: 'dynamic',
      exercise_calorie_percentage: 100,
      include_bmr_in_net_calories: false,
      tdee_allow_negative_adjustment: false,
      timezone: 'UTC',
    });

    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeCheckin: true,
    });

    expect(result.calorieBalance.tdeeProjection).toBeNull();
  });

  test('returns adjusted goal calories under recomp goal mode', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'not_much',
      calorie_goal_adjustment_mode: 'dynamic',
      exercise_calorie_percentage: 100,
      include_bmr_in_net_calories: false,
      tdee_allow_negative_adjustment: false,
      timezone: 'UTC',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'manual',
      goal_mode_custom_percentage: 0,
    });

    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeCheckin: true,
    });

    // Baseline goal from goalService.getUserGoals mock is 2000 kcal
    // recomp is a 10% deficit under manual calculation method.
    // 2000 * (1 - 0.10) = 1800 kcal
    expect(result.calorieBalance.goal).toBe(1800);
  });

  test('returns adjusted goal calories under recomp goal mode with adaptive calculation method', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'not_much',
      calorie_goal_adjustment_mode: 'dynamic',
      exercise_calorie_percentage: 100,
      include_bmr_in_net_calories: false,
      tdee_allow_negative_adjustment: false,
      timezone: 'UTC',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 0,
    });

    // bmr is mocked to 1800. activity multiplier for 'not_much' is 1.2.
    // baselineTdee = 1800 * 1.2 = 2160
    // recomp is 10% deficit -> 2160 * 0.9 = 1944.
    // Safety floors:
    // Mifflin-St Jeor rmr calculates to 1800 because bmrService.calculateBmr is mocked to return 1800.
    // Target 1944 is >= 1800, so final target is 1944.
    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeCheckin: true,
    });

    expect(result.calorieBalance.goal).toBe(1944);
  });

  test('caps target at RMR under adaptive calculation method if deficit is too aggressive', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'not_much',
      calorie_goal_adjustment_mode: 'dynamic',
      exercise_calorie_percentage: 100,
      include_bmr_in_net_calories: false,
      tdee_allow_negative_adjustment: false,
      timezone: 'UTC',
      goal_mode: 'high_cut', // 20% deficit
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 0,
    });

    // bmr is mocked to 1800. activity multiplier is 1.2 -> baselineTdee = 2160.
    // high_cut is 20% deficit -> 2160 * 0.8 = 1728.
    // Since it falls below RMR (1800), adaptive mode auto-raises target to 1800.
    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeCheckin: true,
    });

    expect(result.calorieBalance.goal).toBe(1800);
  });
});
