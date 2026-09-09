/**
 * Centralized constants for step-to-calorie calculations.
 */
export const CALORIE_CALCULATION_CONSTANTS = {
  // Default values for calculations when data is missing
  DEFAULT_WEIGHT_KG: 70,
  DEFAULT_HEIGHT_CM: 175,

  // Conversion constants
  // Kept under its shipped name for API compatibility; the value represents
  // average step length (one footfall), not a two-step gait cycle.
  STRIDE_LENGTH_MULTIPLIER: 0.414,
  // Mean net walking cost at 1.34 m/s: 2.22 J/kg/m = 0.53 kcal/kg/km.
  // DOI: 10.14814/phy2.16023. Net cost avoids counting resting energy twice.
  NET_CALORIES_PER_KG_PER_KM: 0.53,

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
 * Half-width of the Adaptive TDEE plausibility band, in kcal.
 *
 * The log-derived estimate is capped to within this much of `BMR x activity
 * multiplier`. Defined in kcal because the estimate is: any display in another
 * unit must convert it, or the stated band contradicts the bounds beside it.
 */
export const ADAPTIVE_TDEE_CLAMP_KCAL = 500;

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

/**
 * Generous upper bound for a person's cumulative full-day energy expenditure.
 * It protects both projection math and the NUMERIC(8,2) persistence boundary
 * from corrupt provider payloads without constraining realistic athlete days.
 */
export const MAX_HEALTH_TOTAL_CALORIES_PER_DAY = 20_000;

/**
 * Absolute plausibility bounds for a measured BMR, in kcal/day.
 *
 * Deliberately wide — Mifflin-St Jeor gives roughly 1030 kcal for a 40 kg, 150 cm
 * woman and 3070 kcal for a 200 kg, 190 cm man — so it rejects impossible readings
 * without second-guessing an unusual body. These are the bounds that shipped in
 * v1.6.3/v1.6.4; the wider 300-10000 pair used in v1.6.5 let a 350 kcal reading
 * through, which then became the RMR safety floor (issue #2395).
 */
export const MIN_MEASURED_BMR_KCAL = 600;
export const MAX_MEASURED_BMR_KCAL = 6000;

/**
 * How far a measured BMR may sit from the formula estimate for the SAME person
 * before it is treated as implausible.
 *
 * The absolute bounds above cannot catch a reading that is wrong only relative to
 * a particular body: 2400 kcal is unremarkable in isolation but implausible for
 * someone whose formula estimate is 1200. Comparing against the person's own
 * estimate catches unit mismatches and mis-mapped metrics that land inside the
 * absolute range, without narrowing what a genuinely unusual measured BMR can be.
 *
 * A real measured BMR does diverge from a population formula — that is the point
 * of measuring — so the band is loose enough to let real metabolic variation and
 * adaptation through.
 */
export const MEASURED_BMR_MIN_RATIO_OF_FORMULA = 0.6;
export const MEASURED_BMR_MAX_RATIO_OF_FORMULA = 1.6;

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
