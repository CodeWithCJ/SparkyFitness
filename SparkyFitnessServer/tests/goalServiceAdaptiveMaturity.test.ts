import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';
import { computeCalorieTarget } from '@workspace/shared';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const userId = 'user-1';
const date = '2026-08-21';

// BMR 1600 x 1.2 = 1920 estimated baseline. The raw measured estimate is set well
// below that so the two baselines are impossible to confuse in an assertion.
const BMR = 1600;
const ESTIMATED_BASELINE = 1920;
const RAW_MEASURED_TDEE = 1420;
const STORED_GOAL = 1900;
const OFFSET = STORED_GOAL - ESTIMATED_BASELINE; // -20

/**
 * `AdaptiveTdeeService` releases a raw estimate at 7 qualifying days, but a goal
 * budget waits for the stabler window. These tests pin that the adaptive
 * *adjustment* path applies the same maturity test the settings preview does —
 * they had drifted apart, so the saved goal and the preview disagreed for anyone
 * sitting between 7 and 13 days of logs.
 */
describe('goalService adaptive TDEE maturity', () => {
  const mockAdaptive = (
    tdee: number,
    isFallback: boolean,
    daysOfData: number
  ) =>
    vi
      .mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange)
      .mockResolvedValue({
        [date]: {
          tdee,
          confidence: 'HIGH',
          isFallback,
          daysOfData,
          lastCalculated: date,
        },
      });

  const caloriesForDate = async () => {
    const result = await goalService.getUserGoalsForRange(
      userId,
      date,
      date,
      true
    );
    return (result[date] as { calories: number }).calories;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: STORED_GOAL,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: date, weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(BMR);
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'adaptive',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'manual',
      goal_mode_custom_percentage: 0,
      activity_level: 'not_much',
      bmr_algorithm: 'Mifflin-St Jeor',
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
      timezone: 'Europe/Berlin',
    });
  });

  it('ignores a raw estimate that has not reached the goal threshold', async () => {
    mockAdaptive(RAW_MEASURED_TDEE, false, 7);

    // Estimated baseline + offset, not the raw 1420 that the service handed back.
    expect(await caloriesForDate()).toBe(ESTIMATED_BASELINE + OFFSET);
  });

  it('still ignores it on the last immature day', async () => {
    mockAdaptive(RAW_MEASURED_TDEE, false, 13);

    expect(await caloriesForDate()).toBe(ESTIMATED_BASELINE + OFFSET);
  });

  it('uses the measured estimate once it is settled', async () => {
    mockAdaptive(RAW_MEASURED_TDEE, false, 14);

    expect(await caloriesForDate()).toBe(RAW_MEASURED_TDEE + OFFSET);
  });

  it('ignores a fallback estimate however far back it goes', async () => {
    // isFallback means the value already IS bmr x multiplier, so the result is the
    // same either way — but consuming it as though it were measured would be wrong.
    mockAdaptive(ESTIMATED_BASELINE, true, 30);

    expect(await caloriesForDate()).toBe(ESTIMATED_BASELINE + OFFSET);
  });

  it('agrees with the settings preview at 7 days, which is the bug this pins', async () => {
    mockAdaptive(RAW_MEASURED_TDEE, false, 7);

    const goal = await caloriesForDate();
    const preview = computeCalorieTarget({
      goalMode: 'maintain',
      calculationMethod: 'adaptive',
      customPercentage: 0,
      bmr: BMR,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: RAW_MEASURED_TDEE,
      adaptiveTdeeFallback: false,
      adaptiveTdeeDaysOfData: 7,
      weightKg: 80,
      heightCm: 178,
      age: 36,
      gender: 'male',
      currentGoalCalories: STORED_GOAL,
    });

    expect(preview.baselineTdee).toBe(ESTIMATED_BASELINE);
    expect(goal).toBe(preview.baselineTdee + OFFSET);
  });
});
