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
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';

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

  describe('adjustedGoals', () => {
    test('returns null when no calorie adjustment is made (non-adaptive mode)', async () => {
      const result = await getDailySummary({
        actorUserId,
        targetUserId,
        date,
        includeCheckin: true,
      });

      expect(result.adjustedGoals).toBeNull();
    });

    test('returns adjusted macros using percentages when adaptive TDEE changes the goal', async () => {
      vi.mocked(goalService.getUserGoals).mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 67,
        protein_percentage: 30,
        carbs_percentage: 40,
        fat_percentage: 30,
      });
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'not_much',
        calorie_goal_adjustment_mode: 'adaptive',
        exercise_calorie_percentage: 100,
        include_bmr_in_net_calories: false,
        tdee_allow_negative_adjustment: false,
        timezone: 'UTC',
      });
      vi.mocked(adaptiveTdeeService.calculateAdaptiveTdee).mockResolvedValue({
        tdee: 2500,
        confidence: 'HIGH',
        dataPoints: 28,
        weightTrend: 75,
      });

      const result = await getDailySummary({
        actorUserId,
        targetUserId,
        date,
        includeCheckin: true,
      });

      // BMR = 1800, baseline = 1800 * 1.2 = 2160, offset = 2000 - 2160 = -160
      // adjustedCalories = max(1200, round(2500 + (-160))) = 2340
      expect(result.calorieBalance.goal).toBe(2340);
      expect(result.adjustedGoals).not.toBeNull();
      expect(result.adjustedGoals!.calories).toBe(2340);
      // protein: round((2340 * 30/100) / 4) = round(175.5) = 176
      expect(result.adjustedGoals!.protein).toBe(176);
      // carbs: round((2340 * 40/100) / 4) = round(234) = 234
      expect(result.adjustedGoals!.carbs).toBe(234);
      // fat: round((2340 * 30/100) / 9) = round(78) = 78
      expect(result.adjustedGoals!.fat).toBe(78);
    });

    test('returns adjusted macros using proportional scaling when no percentages are set', async () => {
      vi.mocked(goalService.getUserGoals).mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 67,
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      });
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'not_much',
        calorie_goal_adjustment_mode: 'adaptive',
        exercise_calorie_percentage: 100,
        include_bmr_in_net_calories: false,
        tdee_allow_negative_adjustment: false,
        timezone: 'UTC',
      });
      vi.mocked(adaptiveTdeeService.calculateAdaptiveTdee).mockResolvedValue({
        tdee: 2500,
        confidence: 'HIGH',
        dataPoints: 28,
        weightTrend: 75,
      });

      const result = await getDailySummary({
        actorUserId,
        targetUserId,
        date,
        includeCheckin: true,
      });

      // adjustedCalories = 2340, ratio = 2340/2000 = 1.17
      expect(result.adjustedGoals).not.toBeNull();
      expect(result.adjustedGoals!.calories).toBe(2340);
      expect(result.adjustedGoals!.protein).toBe(
        Math.round((150 * 2340) / 2000)
      );
      expect(result.adjustedGoals!.carbs).toBe(Math.round((200 * 2340) / 2000));
      expect(result.adjustedGoals!.fat).toBe(Math.round((67 * 2340) / 2000));
    });

    test('returns null when adaptive mode but no adaptive TDEE data available', async () => {
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'not_much',
        calorie_goal_adjustment_mode: 'adaptive',
        exercise_calorie_percentage: 100,
        include_bmr_in_net_calories: false,
        tdee_allow_negative_adjustment: false,
        timezone: 'UTC',
      });
      vi.mocked(adaptiveTdeeService.calculateAdaptiveTdee).mockRejectedValue(
        new Error('Not enough data')
      );

      const result = await getDailySummary({
        actorUserId,
        targetUserId,
        date,
        includeCheckin: true,
      });

      expect(result.adjustedGoals).toBeNull();
    });
  });
});
