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
] as const;

export type BuiltinMaximumGoalNutrient =
  (typeof BUILTIN_MAXIMUM_GOAL_NUTRIENTS)[number];
