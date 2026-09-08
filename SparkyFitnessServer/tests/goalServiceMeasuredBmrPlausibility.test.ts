import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';

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

// Formula BMR the mocked bmrService always hands back for this person.
const FORMULA_BMR = 1800;
// A stray/carried-forward measured BMR (unit mismatch, a partial-day sync
// value, ...) that clears the absolute 300-10000 sanity bound but is
// nowhere near this person's own formula estimate. GitHub issue #2395:
// enabling Adaptive TDEE + Body Recomposition on top of a value like this
// collapsed the daily calorie target from ~1800 to ~350.
const IMPLAUSIBLE_MEASURED_BMR = 350;

/**
 * Reproduces GitHub issue #2395: a measured BMR carried on the check-in
 * history must not silently replace a sane formula estimate just because it
 * clears the absolute range, especially once a goal-mode deficit (here,
 * Body Recomposition's 10%) is layered on top of it. Two independent guards
 * cover this: the user must opt in via use_external_bmr, and even then the
 * value must be plausible for their own formula estimate.
 */
describe('goalService ignores an implausible measured BMR (issue #2395)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(FORMULA_BMR);
    // No adaptive TDEE history yet -- computeCalorieTarget falls back to
    // bmr * activityMultiplier as the baseline, which is exactly the path
    // that used to be corrupted by an implausible measured BMR.
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {}
    );
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdee).mockRejectedValue(
      new Error('insufficient history')
    );
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'dynamic',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 0,
      activity_level: 'not_much',
      bmr_algorithm: 'Mifflin-St Jeor',
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
      timezone: 'Europe/Berlin',
      // Opted in: these tests exercise the plausibility guard itself, not
      // the opt-in gate (see the dedicated opt-in test below).
      use_external_bmr: true,
    });
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

  it('bases Body Recomposition on the formula BMR when the measured value is implausible', async () => {
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      entry_date: date,
      weight: 80,
      height: 180,
      bmr: IMPLAUSIBLE_MEASURED_BMR,
    });

    // 1800 * 1.2 (not_much) = 2160 baseline TDEE, recomp = -10% = 1944.
    expect(await caloriesForDate()).toBe(1944);
  });

  it('uses a plausible measured BMR over the formula estimate', async () => {
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      entry_date: date,
      weight: 80,
      height: 180,
      bmr: 1700, // within the plausible band around the 1800 formula estimate
    });

    // 1700 * 1.2 = 2040 baseline TDEE, recomp = -10% = 1836.
    expect(await caloriesForDate()).toBe(1836);
  });

  it('ignores an otherwise-plausible measured BMR when use_external_bmr is off', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'dynamic',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 0,
      activity_level: 'not_much',
      bmr_algorithm: 'Mifflin-St Jeor',
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
      timezone: 'Europe/Berlin',
      use_external_bmr: false,
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      entry_date: date,
      weight: 80,
      height: 180,
      bmr: 1700, // plausible, but the user has not opted in to using it
    });

    // Same as the formula-only case: 1800 * 1.2 = 2160, recomp = -10% = 1944.
    expect(await caloriesForDate()).toBe(1944);
  });
});
