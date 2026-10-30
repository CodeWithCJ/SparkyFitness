import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';
import { getAdaptiveActivityCalories } from '../services/adaptiveActivityService.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { CALORIE_RULE_DEFAULTS } from '@workspace/shared';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../models/exerciseEntry.js');
vi.mock('../models/genericHealthRepository.js', () => ({
  getHealthConnectTotalCaloriesByDateRange: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');
vi.mock('../services/adaptiveActivityService.js');

const date = '2026-10-20';
const baseGoal = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 400 / 9,
  protein_percentage: 30,
  carbs_percentage: 50,
  fat_percentage: 20,
  dietary_fiber: 0,
};
const basePreferences = {
  adjust_macros_with_exercise: true,
  calorie_goal_adjustment_mode: 'dynamic',
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  activity_level: 'not_much',
  timezone: 'UTC',
};
const goalsFor = () =>
  goalService.getUserGoalsForRange('user-1', date, date, true);
const expectMacros = (goals: unknown, calories: number) => {
  expect(goals).toMatchObject({
    calories: 2000,
    protein: (calories * 0.3) / 4,
    carbs: (calories * 0.5) / 4,
    fat: (calories * 0.2) / 9,
  });
};

describe('percentage macro exercise earn-back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([]);
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: date, weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(
      new Map([[date, 500]])
    );
  });

  it('increases all percentage macro targets without changing the calorie goal or stored goal', async () => {
    expectMacros((await goalsFor())[date], 2500);
    expect(goalRepository.upsertGoal).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    'preserves existing targets when the setting is %s',
    async (enabled) => {
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        ...basePreferences,
        adjust_macros_with_exercise: enabled,
      });
      expectMacros((await goalsFor())[date], 2000);
      expect(getAdaptiveActivityCalories).not.toHaveBeenCalled();
    }
  );

  it('uses the configured exercise earn-back percentage and excludes resting BMR', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'percentage',
      exercise_calorie_percentage: 50,
      include_bmr_in_net_calories: true,
    });
    expectMacros((await goalsFor())[date], 2250);
  });

  it('does not add resting BMR in dynamic mode', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      include_bmr_in_net_calories: true,
    });
    expectMacros((await goalsFor())[date], 2500);
  });

  it('does not change macros for fixed calorie budgets', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'fixed',
    });
    expectMacros((await goalsFor())[date], 2000);
  });

  it('does not change targets on days without activity', async () => {
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(new Map());
    expectMacros((await goalsFor())[date], 2000);
  });

  it('leaves gram-based macro goals untouched', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    expect((await goalsFor())[date]).toMatchObject({
      protein: 150,
      carbs: 250,
      fat: 400 / 9,
    });
  });

  it('keeps the existing fiber allocation and fiber target', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
      dietary_fiber: 25,
    });
    const goals = (await goalsFor())[date];
    expectMacros(goals, 2450);
    expect(goals).toMatchObject({ dietary_fiber: 25 });
  });

  it('keeps unadjusted reads suitable for editing the saved goal', async () => {
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      date,
      false
    );
    expectMacros(goals[date], 2000);
  });

  it('resolves each selected diary date independently', async () => {
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(
      new Map([
        [date, 500],
        ['2026-10-21', 100],
      ])
    );
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      '2026-10-21',
      true
    );
    expectMacros(goals[date], 2500);
    expectMacros(goals['2026-10-21'], 2100);
  });

  it('uses the positive Device Projection adjustment once', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'tdee',
    });
    expectMacros((await goalsFor())[date], 2300);
  });

  it("uses each diary day's recorded earn-back rules after today's rules change", async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'fixed',
    });
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([
      {
        ...CALORIE_RULE_DEFAULTS,
        effective_date: date,
        calorie_goal_adjustment_mode: 'percentage',
        exercise_calorie_percentage: 50,
      },
      {
        ...CALORIE_RULE_DEFAULTS,
        effective_date: '2026-10-21',
        calorie_goal_adjustment_mode: 'dynamic',
      },
    ]);
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(
      new Map([
        [date, 500],
        ['2026-10-21', 500],
      ])
    );
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      date,
      '2026-10-21',
      true
    );
    expectMacros(goals[date], 2250);
    expectMacros(goals['2026-10-21'], 2500);
  });

  it('loads device totals for a past projection day even when today uses a fixed budget', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'fixed',
    });
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([
      {
        ...CALORIE_RULE_DEFAULTS,
        effective_date: date,
        calorie_goal_adjustment_mode: 'tdee',
      },
    ]);
    expectMacros((await goalsFor())[date], 2300);
    expect(
      genericHealthRepository.getHealthConnectTotalCaloriesByDateRange
    ).toHaveBeenCalledWith('user-1', 'user-1', date, date);
  });

  it('does not count resting-only projection changes as exercise', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      calorie_goal_adjustment_mode: 'tdee',
    });
    vi.mocked(bmrService.calculateBmr).mockReturnValue(2200);
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(new Map());
    expectMacros((await goalsFor())[date], 2000);
  });

  it('does not earn activity back on an adaptive target that already includes it', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      goal_mode_calculation_method: 'adaptive',
    });
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 2600,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 30,
          lastCalculated: date,
        },
      }
    );
    const goal = (await goalsFor())[date] as typeof baseGoal;
    expect(goal.protein).toBe((goal.calories * 0.3) / 4);
  });

  it('credits separated adaptive activity once on top of the activity-excluded baseline', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      goal_mode_calculation_method: 'adaptive',
      adaptive_activity_separate: true,
    });
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 2600,
          activityAdjustedTdee: 2100,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 30,
          lastCalculated: date,
        },
      }
    );
    const goal = (await goalsFor())[date] as typeof baseGoal;
    expect(goal.calories).toBe(2100);
    expect(goal.protein).toBe((2600 * 0.3) / 4);
  });
});
