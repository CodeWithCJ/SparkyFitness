export type CalorieGoalAdjustmentMode =
  | 'dynamic'
  | 'fixed'
  | 'percentage'
  | 'tdee';

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  not_much: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
};

/**
 * Returns the calorie contribution to use from either active (device) calories
 * or step-based calories. Active calories take priority when available.
 */
export function resolveActiveOrStepsCalories(
  activeCaloriesFromExercise: number,
  stepsCalories: number
): number {
  return activeCaloriesFromExercise > 0
    ? activeCaloriesFromExercise
    : stepsCalories;
}

/**
 * TDEE baseline: BMR × activity multiplier.
 * Mirrors MFP's "SparkyFitness Burned" number.
 */
export function computeSparkyfitnessBurned(
  bmr: number,
  activityLevel: string
): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  return Math.round(bmr * multiplier);
}

/**
 * Projects the current device burn rate to end-of-day.
 * Below MIN_DAY_FRACTION (5% of the day, ~72 min) we skip extrapolation
 * to avoid huge early-morning spikes.
 */
export function computeProjectedBurn(
  bmr: number,
  exerciseCaloriesBurned: number,
  now: Date = new Date()
): number {
  const MIN_DAY_FRACTION = 0.05;
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
  const dayFraction = minutesSinceMidnight / (24 * 60);

  const projectedDeviceCalories =
    dayFraction >= MIN_DAY_FRACTION && exerciseCaloriesBurned > 0
      ? Math.round(exerciseCaloriesBurned / dayFraction)
      : exerciseCaloriesBurned;

  return bmr + projectedDeviceCalories;
}

/**
 * Adjustment = projected full-day burn minus the TDEE baseline.
 * Positive → device projects more activity than expected.
 * Negative → less active day (only returned when allowNegative is true).
 */
export function computeTdeeAdjustment(
  projectedBurn: number,
  sparkyfitnessBurned: number,
  allowNegative: boolean
): number {
  const raw = projectedBurn - sparkyfitnessBurned;
  return allowNegative ? raw : Math.max(0, raw);
}

export interface CaloriesRemainingParams {
  mode: CalorieGoalAdjustmentMode;
  goalCalories: number;
  eatenCalories: number;
  netCalories: number;
  exerciseCaloriesBurned: number;
  bmrCalories: number;
  exerciseCaloriePercentage: number;
  tdeeAdjustment: number;
}

/**
 * Computes remaining calories based on the selected goal adjustment mode.
 */
export function computeCaloriesRemaining({
  mode,
  goalCalories,
  eatenCalories,
  netCalories,
  exerciseCaloriesBurned,
  bmrCalories,
  exerciseCaloriePercentage,
  tdeeAdjustment,
}: CaloriesRemainingParams): number {
  switch (mode) {
    case 'tdee':
      return goalCalories - eatenCalories + tdeeAdjustment;
    case 'dynamic':
      return goalCalories - netCalories;
    case 'percentage': {
      const adjustedExerciseBurned =
        exerciseCaloriesBurned * (exerciseCaloriePercentage / 100);
      const adjustedTotalBurned = adjustedExerciseBurned + bmrCalories;
      return goalCalories - (eatenCalories - adjustedTotalBurned);
    }
    case 'fixed':
    default:
      return goalCalories - eatenCalories;
  }
}

/**
 * How many calories exercise has added back to the budget.
 * i.e. the difference between "remaining with exercise" and "remaining without".
 */
export function computeExerciseCredited(
  caloriesRemaining: number,
  goalCalories: number,
  eatenCalories: number
): number {
  return Math.max(0, caloriesRemaining - (goalCalories - eatenCalories));
}

/**
 * Progress percentage (0–100+) towards the daily calorie goal.
 */
export function computeCalorieProgress(
  goalCalories: number,
  caloriesRemaining: number
): number {
  const effectiveConsumed = goalCalories - caloriesRemaining;
  return Math.max(0, (effectiveConsumed / goalCalories) * 100);
}
