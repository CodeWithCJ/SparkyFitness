import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { getAdaptiveActivityCalories } from '../services/adaptiveActivityService.js';
import {
  applyCalorieCyclingMacroDelta,
  cycleWeekTargets,
  trainingRestOffsets,
} from '@workspace/shared';

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
  getDeviceTotalCaloriesByDateRange: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');
vi.mock('../services/adaptiveActivityService.js');

// 2026-10-19 is a Monday; the range runs Monday to Sunday.
const monday = '2026-10-19';
const tuesday = '2026-10-20';
const sunday = '2026-10-25';
const offsets = trainingRestOffsets([1, 3, 5], 15);

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
  calorie_goal_adjustment_mode: 'fixed',
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  activity_level: 'not_much',
  calorie_safety_floor_mode: 'custom',
  calorie_safety_floor_value: 1200,
  calorie_cycling_mode: 'training_rest',
  calorie_cycling_offsets: offsets,
  timezone: 'UTC',
};

type DayGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorie_cycling?: {
    status: string;
    baseTarget: number;
    delta: number;
    dayType: string;
    clampedToFloor: boolean;
  };
};

const week = (adjust = true) =>
  goalService.getUserGoalsForRange('user-1', monday, sunday, adjust) as Promise<
    Record<string, DayGoals>
  >;
const usePreferences = (overrides: Record<string, unknown>) =>
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
    ...basePreferences,
    ...overrides,
  });

describe('calorie cycling in the daily goal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([]);
    vi.mocked(
      genericHealthRepository.getDeviceTotalCaloriesByDateRange
    ).mockResolvedValue([]);
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    usePreferences({});
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ entry_date: monday, weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1800);
    vi.mocked(getAdaptiveActivityCalories).mockResolvedValue(new Map());
  });

  it('gives training days more and rest days less, keeping the week total', async () => {
    const goals = await week();
    const expected = cycleWeekTargets({
      baseTarget: 2000,
      offsets,
      floor: 1200,
    });
    const days = Object.keys(goals);

    expect(days).toHaveLength(7);
    // Monday = weekday 1.
    days.forEach((day, index) => {
      expect(goals[day].calories, day).toBe(expected[(index + 1) % 7].target);
    });
    expect(goals[monday].calorie_cycling).toMatchObject({
      status: 'active',
      baseTarget: 2000,
      dayType: 'high',
    });
    expect(goals[tuesday].calorie_cycling?.dayType).toBe('low');
    const total = days.reduce((sum, day) => sum + goals[day].calories, 0);
    expect(Math.abs(total - 14000)).toBeLessThanOrEqual(4);
  });

  it('moves only carbs; protein and fat follow the base target', async () => {
    const goals = await week();
    const delta = goals[monday].calorie_cycling?.delta ?? 0;

    expect(delta).toBeGreaterThan(0);
    expect(goals[monday].protein).toBe(150);
    expect(goals[monday].fat).toBeCloseTo(400 / 9);
    expect(goals[monday].carbs).toBe(
      applyCalorieCyclingMacroDelta(
        { protein: 150, carbs: 250, fat: 400 / 9 },
        delta
      ).carbs
    );
    expect(goals[tuesday].carbs).toBeLessThan(250);
  });

  it('moves carbs for gram-based goals too', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      ...baseGoal,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    const goals = await week();
    const delta = goals[monday].calorie_cycling?.delta ?? 0;

    expect(goals[monday].protein).toBe(150);
    expect(goals[monday].carbs).toBe(
      applyCalorieCyclingMacroDelta(
        { protein: 150, carbs: 250, fat: 400 / 9 },
        delta
      ).carbs
    );
  });

  it('holds rest days at the safety floor and takes the rest from training days', async () => {
    usePreferences({ calorie_safety_floor_value: 1950 });
    const goals = await week();

    expect(goals[tuesday].calories).toBe(1950);
    expect(goals[tuesday].calorie_cycling?.clampedToFloor).toBe(true);
    const total = Object.values(goals).reduce(
      (sum, day) => sum + day.calories,
      0
    );
    expect(Math.abs(total - 14000)).toBeLessThanOrEqual(4);
  });

  it('pauses while exercise calories are added back', async () => {
    usePreferences({ calorie_goal_adjustment_mode: 'dynamic' });
    const goals = await week();

    expect(goals[monday].calories).toBe(2000);
    expect(goals[monday].carbs).toBe(250);
    expect(goals[monday].calorie_cycling?.status).toBe('paused_earn_back');
  });

  it('leaves a day from a weekly goal plan alone', async () => {
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([
      {
        id: 'plan',
        user_id: 'user-1',
        plan_name: 'plan',
        is_active: true,
        start_date: '2026-10-01',
        end_date: null,
        monday_preset_id: 'training',
      },
    ]);
    vi.mocked(goalPresetRepository.getGoalPresetById).mockResolvedValue({
      id: 'training',
      calories: 2400,
    });
    const goals = await week();

    expect(goals[monday].calories).toBe(2400);
    expect(goals[monday].calorie_cycling?.status).toBe('paused_weekly_plan');
    expect(goals[tuesday].calorie_cycling?.status).toBe('active');
  });

  it('does nothing when switched off, and never on unadjusted reads', async () => {
    usePreferences({ calorie_cycling_mode: 'off' });
    const off = await week();
    expect(off[monday].calories).toBe(2000);
    expect(off[monday].calorie_cycling).toBeUndefined();

    usePreferences({});
    const raw = await week(false);
    expect(raw[monday].calories).toBe(2000);
    expect(raw[monday].carbs).toBe(250);
  });
});
