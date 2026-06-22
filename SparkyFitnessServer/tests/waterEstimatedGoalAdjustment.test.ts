import { vi, beforeEach, describe, expect, it } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';

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

const userId = 'user-123';
const testDate = '2026-06-22';

describe('Water goal adjustment by exercise water loss', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
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
});
