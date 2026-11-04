import { DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR } from '../constants/calorieConstants.ts';
import type { CalorieRules } from '../schemas/database/UserCalorieRuleHistory.zod.ts';

export type ResolvedCalorieRules = {
  [K in keyof CalorieRules]-?: NonNullable<CalorieRules[K]>;
};

/** What the calorie maths uses for a setting that is not set. */
export const CALORIE_RULE_DEFAULTS: ResolvedCalorieRules = {
  goal_mode: 'maintain',
  goal_mode_calculation_method: 'manual',
  goal_mode_custom_percentage: 0,
  goal_mode_weekly_change_kg: 0,
  calorie_goal_adjustment_mode: 'dynamic',
  exercise_calorie_percentage: 100,
  tdee_allow_negative_adjustment: false,
  calorie_safety_floor_mode: 'standard',
  calorie_safety_floor_value: DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  adaptive_activity_separate: false,
  bmr_algorithm: 'Mifflin-St Jeor',
  activity_level: 'not_much',
  use_external_bmr: false,
  include_bmr_in_net_calories: false,
  adjust_macros_with_exercise: false,
};

/** The calorie settings of `preferences`, with the defaults for unset ones. */
export function withCalorieRuleDefaults(
  preferences: Partial<Record<keyof CalorieRules, unknown>> | null | undefined
): ResolvedCalorieRules {
  const resolved: Record<string, unknown> = { ...CALORIE_RULE_DEFAULTS };
  for (const field of Object.keys(CALORIE_RULE_DEFAULTS)) {
    const value = preferences?.[field as keyof CalorieRules];
    if (value !== null && value !== undefined) resolved[field] = value;
  }
  return resolved as ResolvedCalorieRules;
}
