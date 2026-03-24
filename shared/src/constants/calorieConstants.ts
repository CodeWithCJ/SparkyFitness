/**
 * Centralized constants for step-to-calorie calculations.
 */
export const CALORIE_CALCULATION_CONSTANTS = {
  // Default values for calculations when data is missing
  DEFAULT_WEIGHT_KG: 70,
  DEFAULT_HEIGHT_CM: 175,

  // Conversion constants
  STRIDE_LENGTH_MULTIPLIER: 0.414, // Avg multiplier for height to stride length
  NET_CALORIES_PER_KG_PER_KM: 0.4, // Net calories burned per kg per km (above BMR)

  // Day projection constants
  MIN_DAY_FRACTION: 0.05, // 5% of the day (~72 min)
} as const;

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  not_much: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
} as const;
