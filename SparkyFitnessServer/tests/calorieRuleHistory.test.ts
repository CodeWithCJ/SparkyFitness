import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CALORIE_RULE_DEFAULTS, CALORIE_RULE_FIELDS } from '@workspace/shared';
import type { CalorieRules } from '@workspace/shared';
import type { CalorieRuleHistoryRow } from '../models/calorieRuleHistoryRepository.js';
import {
  calorieRulesOnDay,
  preferencesOnDay,
} from '../services/calorieRuleHistoryService.js';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/calorieRuleHistoryRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const rules: CalorieRules = {
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  goal_mode_custom_percentage: 0,
  goal_mode_weekly_change_kg: 0,
  calorie_goal_adjustment_mode: 'dynamic',
  exercise_calorie_percentage: 100,
  tdee_allow_negative_adjustment: false,
  calorie_safety_floor_mode: 'standard',
  calorie_safety_floor_value: 1200,
  adaptive_activity_separate: false,
  bmr_algorithm: 'Mifflin-St Jeor',
  activity_level: 'not_much',
  use_external_bmr: false,
  include_bmr_in_net_calories: false,
  adjust_macros_with_exercise: false,
};

const row = (
  effective_date: string,
  changes: Partial<CalorieRules> = {}
): CalorieRuleHistoryRow => ({ ...rules, ...changes, effective_date });

describe('calorie rules on a day', () => {
  const history = [
    row('-infinity', { goal_mode: 'maintain' }),
    row('2026-10-10', { goal_mode: 'cut' }),
    row('2026-10-20', { goal_mode: 'bulk' }),
  ];

  it('takes the latest row on or before the day', () => {
    expect(calorieRulesOnDay(history, '2026-01-01')?.goal_mode).toBe(
      'maintain'
    );
    expect(calorieRulesOnDay(history, '2026-10-10')?.goal_mode).toBe('cut');
    expect(calorieRulesOnDay(history, '2026-10-19')?.goal_mode).toBe('cut');
    expect(calorieRulesOnDay(history, '2026-10-22')?.goal_mode).toBe('bulk');
  });

  // A database whose default collation ignores punctuation sorts the text
  // '-infinity' after real dates.
  it('takes the same rows in any order', () => {
    const unordered = [history[2], history[1], history[0]];
    expect(calorieRulesOnDay(unordered, '2026-01-01')?.goal_mode).toBe(
      'maintain'
    );
    expect(calorieRulesOnDay(unordered, '2026-10-19')?.goal_mode).toBe('cut');
    expect(calorieRulesOnDay(unordered, '2026-10-22')?.goal_mode).toBe('bulk');
  });

  it('keeps the current preferences when no change was recorded', () => {
    const current = { ...rules, goal_mode: 'cut', timezone: 'UTC' };

    expect(preferencesOnDay(current, [], '2026-10-01')).toEqual(current);
    expect(
      preferencesOnDay(current, [row('2026-10-10')], '2026-10-01')
    ).toEqual(current);
  });

  // The calorie maths and the Diary's explanation of it both take an unset
  // setting from CALORIE_RULE_DEFAULTS, through this function.
  it('fills an unset setting with its default', () => {
    const unset = {
      ...Object.fromEntries(CALORIE_RULE_FIELDS.map((field) => [field, null])),
      timezone: 'UTC',
    };

    expect(preferencesOnDay(unset, [], '2026-10-01')).toEqual({
      ...CALORIE_RULE_DEFAULTS,
      timezone: 'UTC',
    });
    expect(
      preferencesOnDay(
        { timezone: 'UTC' },
        [row('-infinity', { calorie_goal_adjustment_mode: null })],
        '2026-10-01'
      )
    ).toEqual({
      ...rules,
      calorie_goal_adjustment_mode: 'dynamic',
      timezone: 'UTC',
    });
  });

  it('replaces only the calorie rules', () => {
    const current = { ...rules, goal_mode: 'bulk', timezone: 'Europe/Berlin' };

    expect(preferencesOnDay(current, history, '2026-10-12')).toEqual({
      ...current,
      goal_mode: 'cut',
    });
  });
});

describe('preferences the calorie maths reads', () => {
  const services = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'services'
  );
  // Settings that do not change a day's calorie target.
  const notCalorieRules = ['timezone', 'add_exercise_water_to_goal'];

  // A setting read here but missing from CALORIE_RULE_FIELDS would rewrite
  // past days again whenever it changes (#1795). Add it to the shared list,
  // the user_calorie_rule_history table and its trigger.
  it.each([
    'calorieBalanceService.ts',
    'goalService.ts',
    'AdaptiveTdeeService.ts',
    'reportService.ts',
    'DashboardService.ts',
    'dailySummaryService.ts',
    'dailySummaryRangeService.ts',
  ])('%s reads only recorded calorie rules', (file) => {
    const source = fs.readFileSync(path.join(services, file), 'utf8');
    const read = new Set(
      [
        ...source.matchAll(
          /\b(?:userPreferences|dayPreferences|currentPreferences|preferences)\??\.([a-z_]+)/g
        ),
      ].map((match) => match[1]!)
    );

    expect(
      [...read].filter(
        (field) =>
          !notCalorieRules.includes(field) &&
          !(CALORIE_RULE_FIELDS as readonly string[]).includes(field)
      )
    ).toEqual([]);
  });
});

describe('goal for a day before a settings change', () => {
  const caloriesByDay = async (
    current: CalorieRules,
    history: CalorieRuleHistoryRow[]
  ) => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...current,
      timezone: 'UTC',
    });
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue(history);
    const goals = await goalService.getUserGoalsForRange(
      'user-1',
      '2026-10-19',
      '2026-10-21',
      true
    );
    return Object.fromEntries(
      Object.entries(goals).map(([day, goal]) => [
        day,
        (goal as { calories: number }).calories,
      ])
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2200,
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
    ).mockResolvedValue({ entry_date: '2026-10-01', weight: 80, height: 178 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1700);
  });

  it('takes the age on each day, so a birthday leaves earlier days alone', async () => {
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-10-20',
      gender: 'male',
    });
    await caloriesByDay(rules, []);

    const ages = vi
      .mocked(bmrService.calculateBmr)
      .mock.calls.map((call) => call[3]);
    // The range is 2026-10-19 to 2026-10-21, first day first.
    expect(ages.at(0)).toBe(35);
    expect(ages.at(-1)).toBe(36);
  });

  it('keeps the target of the rules it was logged against', async () => {
    const before: CalorieRules = { ...rules, goal_mode: 'maintain' };
    const after: CalorieRules = { ...rules, goal_mode: 'cut' };
    const old = (await caloriesByDay(before, []))['2026-10-19'];
    const changed = (await caloriesByDay(after, []))['2026-10-21'];
    expect(old).not.toBe(changed);

    expect(
      await caloriesByDay(after, [
        row('-infinity', before),
        row('2026-10-20', after),
      ])
    ).toEqual({
      '2026-10-19': old,
      '2026-10-20': changed,
      '2026-10-21': changed,
    });
  });
});
