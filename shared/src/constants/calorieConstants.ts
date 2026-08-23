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

/**
 * Energy density of body-weight change, in kcal per kg. Applies in **both**
 * directions -- weight lost and weight gained.
 *
 * Any "kcal per kg" figure is a blend of two fixed constants from Hall's model
 * (NIDDK Body Weight Planner): fat tissue ~9441 kcal/kg (39.5 MJ/kg) and lean
 * tissue ~1816 kcal/kg (7.6 MJ/kg). Picking a value is therefore just asserting
 * a fat:lean composition for the weight that changed. 6000 implies roughly
 * 55% fat / 45% lean and water.
 *
 * Lower than the textbook 7700 (which assumes 78/22, i.e. the "3500 kcal per
 * pound" rule) because over the short windows this app measures, a meaningful
 * share of the change is glycogen and water. Measured energy density of
 * short-term 1-3 kg swings averages ~2380 kcal/kg, i.e. below both figures.
 *
 * A direction-specific pair was evaluated and deliberately rejected: at the
 * lean-gain rates this app recommends (0.1-0.5% body weight/week), the gain
 * lands near the same ~55/45 blend, which works out to
 * 0.55 * 9441 + 0.45 * 1816 = ~6010 kcal/kg -- the same 6000 within the
 * precision anything here is measured to. A second constant would have implied
 * a distinction the data does not support.
 *
 * This is a modelling constant, not a user preference: it is unobservable to the
 * user (it needs a DEXA scan to know), and a wrong value silently skews every
 * calorie target with no visible symptom. It is deliberately not configurable.
 */
export const ENERGY_DENSITY_KCAL_PER_KG = 6000;

/**
 * Qualifying calorie-log days before a measured adaptive TDEE may drive a goal.
 *
 * `AdaptiveTdeeService` releases a raw estimate at 7 days, which is enough to
 * report but not enough to budget against: the estimate is still moving, and a
 * goal that tracks it lurches. Goals therefore wait for a stabler window, which
 * is the threshold the settings UI calls "target budget stability".
 */
export const ADAPTIVE_TDEE_GOAL_MIN_DAYS = 14;

export const CALORIE_SAFETY_FLOOR_MODES = [
  "standard",
  "custom",
  "disabled",
] as const;

export type CalorieSafetyFloorMode =
  (typeof CALORIE_SAFETY_FLOOR_MODES)[number];

/** Guardrails for persisted custom values; disabling remains an explicit mode. */
export const MIN_CALORIE_SAFETY_FLOOR = 800;
export const MAX_CALORIE_SAFETY_FLOOR = 5_000;
export const DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR = 1200;

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  none: 1.0,
  not_much: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,

  // Backend keys
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
} as const;
