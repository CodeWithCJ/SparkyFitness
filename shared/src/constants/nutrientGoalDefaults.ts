// Predefined nutrient keys whose goal direction defaults to "maximum" (stay
// under the goal) rather than the general default of "minimum" (more is
// better), when the user has no saved override in
// user_nutrient_goal_preferences. Single source of truth for:
// - SparkyFitnessServer/services/nutrientGoalPreferenceService.ts (builtinDefaultFor)
// - SparkyFitnessFrontend/src/constants/nutrients.ts (CENTRAL_NUTRIENT_CONFIG.defaultGoalType)
export const BUILTIN_MAXIMUM_GOAL_NUTRIENTS = [
  "cholesterol",
  "sodium",
  "saturated_fat",
  "trans_fat",
  "sugars",
  "caffeine_mg",
  "alcohol_g",
] as const;

export type BuiltinMaximumGoalNutrient =
  (typeof BUILTIN_MAXIMUM_GOAL_NUTRIENTS)[number];

/**
 * Predefined nutrient keys permanently barred from the generic nutrient goal
 * system. user_goals.water_goal_ml is the sole water goal, so water_ml is
 * barred to prevent competing goals.
 */
export const NON_GOAL_NUTRIENT_KEYS = ["water_ml"] as const;

export type NonGoalNutrientKey = (typeof NON_GOAL_NUTRIENT_KEYS)[number];

