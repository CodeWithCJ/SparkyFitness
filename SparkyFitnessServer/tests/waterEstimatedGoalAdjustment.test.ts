import { vi, beforeEach, describe, expect, it } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import customNutrientService from '../services/customNutrientService.js';

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/goalRepository');
vi.mock('../models/weeklyGoalPlanRepository');
vi.mock('../models/goalPresetRepository');
vi.mock('../models/userRepository');
vi.mock('../models/preferenceRepository');
vi.mock('../models/measurementRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../services/bmrService');
vi.mock('../services/AdaptiveTdeeService');
vi.mock('../utils/timezoneLoader');
vi.mock('../services/customNutrientService');

const userId = 'user-123';
const testDate = '2026-06-22';

describe('Water goal adjustment by exercise water loss', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      water_goal_ml: 2000,
      calories: 2000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(null);
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue(null);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
  });

  it('adjusts water_goal_ml when adjust=true and preference is enabled', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      add_exercise_water_to_goal: true,
      calorie_goal_adjustment_mode: 'dynamic',
    });
    vi.mocked(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).mockResolvedValue({ [testDate]: 500 });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      true
    );

    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      2500
    );
    expect(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).toHaveBeenCalledWith(userId, testDate, testDate);
  });

  it('does not adjust water_goal_ml when preference is disabled', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      add_exercise_water_to_goal: false,
      calorie_goal_adjustment_mode: 'dynamic',
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      true
    );

    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      2000
    );
    expect(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).not.toHaveBeenCalled();
  });

  it('does not adjust when adjust=false even if preference is enabled', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      add_exercise_water_to_goal: true,
      calorie_goal_adjustment_mode: 'dynamic',
    });
    vi.mocked(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).mockResolvedValue({ [testDate]: 500 });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      false
    );

    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      2000
    );
    expect(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).not.toHaveBeenCalled();
  });

  it('uses default water goal (1920) when no base goal is set', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      add_exercise_water_to_goal: true,
      calorie_goal_adjustment_mode: 'dynamic',
    });
    vi.mocked(
      exerciseEntryRepository.getWaterEstimatedSumForDateRange
    ).mockResolvedValue({ [testDate]: 300 });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      true
    );

    // Should use 1920 (default) + 300
    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      2220
    );
  });

  it('maps a weekly plan preset water_goal column to water_goal_ml', async () => {
    // 2026-06-22 is a Monday.
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      {
        id: 'plan-1',
        user_id: userId,
        plan_name: 'Plan',
        is_active: true,
        start_date: '2026-01-01',
        end_date: null,
        monday_preset_id: 'preset-1',
      },
    ]);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      id: 'preset-1',
      calories: 2000,
      water_goal: 3000,
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      false
    );

    const goals = result[testDate] as Record<string, unknown>;
    expect(goals.water_goal_ml).toBe(3000);
    expect(goals).not.toHaveProperty('water_goal');
    expect(goalPresetRepository.getGoalPresetById).toHaveBeenCalledWith(
      'preset-1',
      userId
    );
  });

  it('keeps the water goal in effect when a weekly plan preset has none', async () => {
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      {
        id: 'plan-1',
        user_id: userId,
        plan_name: 'Plan',
        is_active: true,
        start_date: '2026-01-01',
        end_date: null,
        monday_preset_id: 'preset-1',
      },
    ]);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      id: 'preset-1',
      calories: 2000,
      water_goal: null,
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      false
    );

    // The most recent explicit goal (beforeEach) sets 2000 ml.
    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      2000
    );
  });

  it('falls back to the default water goal when neither the preset nor the prior goal has one', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      water_goal_ml: null,
    });
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      {
        id: 'plan-1',
        user_id: userId,
        plan_name: 'Plan',
        is_active: true,
        start_date: '2026-01-01',
        end_date: null,
        monday_preset_id: 'preset-1',
      },
    ]);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      id: 'preset-1',
      calories: 2000,
      water_goal: null,
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      testDate,
      testDate,
      false
    );

    expect((result[testDate] as Record<string, unknown>).water_goal_ml).toBe(
      1920
    );
  });
});

describe('manageGoalTimeline water goal storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customNutrientService.getCustomNutrients).mockResolvedValue([]);
  });

  const savedWaterGoal = async (p_water_goal_ml: unknown) => {
    await goalService.manageGoalTimeline(userId, {
      p_start_date: testDate,
      p_cascade: false,
      p_calories: 2000,
      p_water_goal_ml,
    });
    return vi.mocked(goalRepository.upsertGoal).mock.calls[0][0].water_goal_ml;
  };

  it.each([undefined, null, '', '   '])(
    'stores a missing water goal (%j) as null',
    async (value) => {
      expect(await savedWaterGoal(value)).toBeNull();
    }
  );

  it('keeps an intentional zero', async () => {
    expect(await savedWaterGoal(0)).toBe(0);
  });

  it('stores a numeric string as a number', async () => {
    expect(await savedWaterGoal('2500')).toBe(2500);
  });
});
