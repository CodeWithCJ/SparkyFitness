import { z } from 'zod';
import { userPreferencesSchema } from './UserPreferences.zod.ts';

/**
 * The user_preferences fields that feed a day's calorie or macro target. A past day
 * uses the values in force on that day (#1795), so every field the calorie
 * maths reads belongs here, in the history table and in its trigger. Picked
 * from the preferences schema, so each keeps the type user_preferences has.
 */
export const calorieRulesSchema = userPreferencesSchema.pick({
  goal_mode: true,
  goal_mode_calculation_method: true,
  goal_mode_custom_percentage: true,
  goal_mode_weekly_change_kg: true,
  calorie_goal_adjustment_mode: true,
  exercise_calorie_percentage: true,
  tdee_allow_negative_adjustment: true,
  calorie_safety_floor_mode: true,
  calorie_safety_floor_value: true,
  adaptive_activity_separate: true,
  bmr_algorithm: true,
  activity_level: true,
  use_external_bmr: true,
  include_bmr_in_net_calories: true,
  adjust_macros_with_exercise: true,
});

export const CALORIE_RULE_FIELDS = calorieRulesSchema.keyof().options;

export const userCalorieRuleHistoryIdSchema = z.string();

export const userCalorieRuleHistorySchema = calorieRulesSchema.extend({
  id: userCalorieRuleHistoryIdSchema.optional(),
  user_id: z.string(),
  /** 'YYYY-MM-DD', or '-infinity' for the rules before the first recorded change. */
  effective_date: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type CalorieRules = z.infer<typeof calorieRulesSchema>;
export type CalorieRuleField = keyof CalorieRules;
export type UserCalorieRuleHistory = z.infer<
  typeof userCalorieRuleHistorySchema
>;
