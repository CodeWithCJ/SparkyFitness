import {
  ACTIVITY_MULTIPLIERS,
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  CALORIE_CALCULATION_CONSTANTS,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  ENERGY_DENSITY_KCAL_PER_KG,
  MAX_CALORIE_SAFETY_FLOOR,
  MIN_CALORIE_SAFETY_FLOOR,
  type CalorieSafetyFloorMode,
} from "../constants/calorieConstants.ts";

export function convertEnergyValue(
  value: number,
  fromUnit: "kcal" | "kJ",
  toUnit: "kcal" | "kJ",
): number {
  if (fromUnit === toUnit) return value;
  return fromUnit === "kcal" ? value * 4.184 : value / 4.184;
}

export type CalorieGoalAdjustmentMode =
  | "dynamic"
  | "fixed"
  | "percentage"
  | "tdee"
  | "smart"
  | "adaptive";

/**
 * Collapses `smart` onto `tdee` for anything that branches on the mode.
 *
 * `smart` is not a separate calculation: `computeCaloriesRemaining` and
 * `computeCalorieBalance` both branch `tdee`/`smart` together, and nothing else in the
 * codebase tells them apart. It also has no UI of its own, so every `=== "tdee"` check
 * silently excluded it and fell through to the *fixed*-mode branch -- which on the Diary
 * meant hiding the TDEE projection the server had already computed and sent.
 *
 * Presentation-only. This never changes what is persisted, so a stored `smart` stays
 * `smart` and keeps behaving as the server intends.
 */
export function normalizeCalorieGoalAdjustmentMode(
  mode: CalorieGoalAdjustmentMode | string | null | undefined,
): CalorieGoalAdjustmentMode {
  if (!mode) return "dynamic";
  return mode === "smart" ? "tdee" : (mode as CalorieGoalAdjustmentMode);
}

export type ExerciseCalorieSource = "logged" | "active" | "steps" | "none";

export interface ResolvedExerciseCalories {
  calories: number;
  source: ExerciseCalorieSource;
}

/** Derives active energy from total energy that includes resting energy. */
export function deriveActiveCalories(
  totalCalories: number,
  restingCalories: number,
): number | null {
  if (
    !Number.isFinite(totalCalories) ||
    !Number.isFinite(restingCalories) ||
    totalCalories < 0 ||
    restingCalories < 0
  ) {
    return null;
  }
  return Math.max(0, totalCalories - restingCalories);
}

/**
 * Returns the calorie contribution from the most complete source.
 * It compares:
 * 1. Summary "Active Calories" from a device (which usually includes steps + workouts).
 * 2. Logged individual workouts + estimated background steps.
 *
 * It returns whichever is larger to ensure we don't under-count, but avoids
 * double-counting by not adding steps on top of a device-wide "Active Calories" summary.
 */
export interface StepCalorieInputs {
  /**
   * Steps that no logged exercise entry already accounts for, i.e. the day's total
   * steps minus the steps attributed to workouts. Passing raw total steps here would
   * double-count the walking a logged workout already charged for.
   */
  backgroundSteps: number;
  weightKg?: number;
  heightCm?: number;
}

/**
 * Net (above-BMR) kcal from background walking, estimated from step count.
 *
 * Stride length is approximated from height, distance from stride × steps, and energy
 * from distance × body weight. The per-kg-per-km figure is deliberately conservative
 * because these are incidental steps, not a workout.
 *
 * Shared because this arithmetic has to agree in four places that each used to carry
 * their own copy: the Diary's per-date step calories, the ranged Reports path, the
 * dashboard stats endpoint, and the frontend's own step estimate. When those drift, the
 * same day's walking is worth a different number of calories depending on which screen
 * is asking -- which is the class of bug this function exists to end.
 */
export function computeStepCalories({
  backgroundSteps,
  weightKg = CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG,
  heightCm = CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM,
}: StepCalorieInputs): number {
  if (!Number.isFinite(backgroundSteps) || backgroundSteps <= 0) return 0;

  const strideLengthM =
    (heightCm * CALORIE_CALCULATION_CONSTANTS.STRIDE_LENGTH_MULTIPLIER) / 100;
  const distanceKm = (backgroundSteps * strideLengthM) / 1000;

  return Math.round(
    distanceKm *
      weightKg *
      CALORIE_CALCULATION_CONSTANTS.NET_CALORIES_PER_KG_PER_KM,
  );
}

/**
 * Background step kcal from a day's raw totals.
 *
 * Wraps the two rules that always travel together: steps a logged workout already
 * accounted for are not background steps, and a missing or non-positive body
 * measurement falls back to the default rather than zeroing the day. Both the per-date
 * Diary path and the ranged Reports path call this, so they cannot drift apart.
 */
export function resolveBackgroundStepCalories({
  totalSteps,
  activitySteps,
  weightKg,
  heightCm,
}: {
  totalSteps: number;
  activitySteps: number;
  /** Non-positive or nullish values fall back to the default. */
  weightKg?: number | null;
  heightCm?: number | null;
}): number {
  return computeStepCalories({
    backgroundSteps: Math.max(0, (totalSteps || 0) - (activitySteps || 0)),
    weightKg:
      weightKg && weightKg > 0
        ? weightKg
        : CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG,
    heightCm:
      heightCm && heightCm > 0
        ? heightCm
        : CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM,
  });
}

export function resolveExerciseCalories(
  loggedExerciseCalories: number,
  activeCaloriesFromExercise: number,
  backgroundStepCalories: number,
): ResolvedExerciseCalories {
  const workoutPlusSteps = loggedExerciseCalories + backgroundStepCalories;

  if (
    activeCaloriesFromExercise > 0 &&
    activeCaloriesFromExercise >= workoutPlusSteps
  ) {
    return {
      calories: activeCaloriesFromExercise,
      source: "active",
    };
  }

  if (workoutPlusSteps > 0) {
    return {
      calories: workoutPlusSteps,
      source: loggedExerciseCalories > 0 ? "logged" : "steps",
    };
  }

  return { calories: 0, source: "none" };
}

/**
 * TDEE baseline: BMR × activity multiplier.
 */
export function computeSparkyfitnessBurned(
  bmr: number,
  activityLevel: string,
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
  now: Date = new Date(),
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
  allowNegative: boolean,
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
  adaptiveTdee?: number;
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
    case "adaptive":
      return goalCalories - eatenCalories;
    case "tdee":
    case "smart":
      return goalCalories - eatenCalories + tdeeAdjustment;
    case "dynamic":
      return goalCalories - netCalories;
    case "percentage": {
      const adjustedExerciseBurned =
        exerciseCaloriesBurned * (exerciseCaloriePercentage / 100);
      const adjustedTotalBurned = adjustedExerciseBurned + bmrCalories;
      return goalCalories - (eatenCalories - adjustedTotalBurned);
    }
    case "fixed":
    default:
      return goalCalories - eatenCalories;
  }
}

/**
 * How many calories exercise has added back to the budget.
 */
export function computeExerciseCredited(
  caloriesRemaining: number,
  goalCalories: number,
  eatenCalories: number,
): number {
  return Math.max(0, caloriesRemaining - (goalCalories - eatenCalories));
}

/**
 * Progress percentage (0–100+) towards the daily calorie goal.
 */
export function computeCalorieProgress(
  goalCalories: number,
  caloriesRemaining: number,
): number {
  const effectiveConsumed = goalCalories - caloriesRemaining;
  return Math.max(0, (effectiveConsumed / goalCalories) * 100);
}

/** A set row carrying per-set duration and rest, both in SECONDS. */
export interface TimedSetLike {
  duration?: number | null;
  rest_time?: number | null;
}

/**
 * Total workout minutes from per-set duration + rest (both integer seconds).
 * `fallbackMinutes` is returned when the sets sum to 0 or are absent,
 * preserving the legacy "empty preset defaults to 30 minutes" behavior.
 */
export function setsDurationMinutes(
  sets: readonly TimedSetLike[] | null | undefined,
  options?: { fallbackMinutes?: number },
): number {
  const rows = Array.isArray(sets) ? sets : [];
  const totalSeconds = rows.reduce(
    // Values flow through pg drivers and legacy call sites, so coerce defensively.
    (sum, set) =>
      sum + (Number(set.duration) || 0) + (Number(set.rest_time) || 0),
    0,
  );
  const minutes = totalSeconds / 60;
  if (minutes === 0 && options?.fallbackMinutes != null) {
    return options.fallbackMinutes;
  }
  return minutes;
}

/** A set row carrying per-set distance in KM. */
export interface DistanceSetLike {
  distance?: number | null;
}

/**
 * Total distance in km across sets, or null when no set carries one.
 * Distinguishing "no distance recorded" (null) from an explicit 0 lets
 * entry-total derivation preserve existing values for distance-less sets.
 */
export function setsDistanceKm(
  sets: readonly DistanceSetLike[] | null | undefined,
): number | null {
  const rows = Array.isArray(sets) ? sets : [];
  let total: number | null = null;
  for (const set of rows) {
    // Values flow through pg drivers and legacy call sites, so coerce defensively.
    const km = set.distance == null ? null : Number(set.distance);
    if (km == null || Number.isNaN(km)) continue;
    total = (total ?? 0) + km;
  }
  return total;
}

export type GoalMode =
  | "maintain"
  | "recomp"
  | "cut"
  | "high_cut"
  | "lean_bulk"
  | "bulk"
  | "manual";
export type GoalModeCalculationMethod = "adaptive" | "manual";

/** Largest magnitude, in percent, that a manual goal-mode adjustment may take in either direction. */
export const MAX_GOAL_MODE_PERCENTAGE = 40;

/**
 * Signed adjustment applied to the baseline TDEE, as a fraction.
 *
 * **Return value: positive means a deficit, negative means a surplus.** That is
 * the orientation the arithmetic needs, since callers apply it as
 * `baselineTdee * (1 - adjustment)` and the sign flows through without branching.
 *
 * Note this is the *opposite* orientation to the stored user preference. The
 * user-facing `customPercentage` follows the convention people expect from a
 * fitness app — **positive adds calories, negative cuts them** — so it is negated
 * on the way in. Migration `20260816173934` flipped existing stored values to
 * match; anything read from `user_preferences.goal_mode_custom_percentage`
 * already uses the user-facing orientation.
 */
export function getGoalModeAdjustment(
  goalMode: string,
  customPercentage: number = 0,
): number {
  switch (goalMode) {
    case "recomp":
      return 0.1;
    case "cut":
      return 0.15;
    case "high_cut":
      return 0.2;
    case "lean_bulk":
      return -0.1;
    case "bulk":
      return -0.2;
    case "manual": {
      const clamped = Math.min(
        MAX_GOAL_MODE_PERCENTAGE,
        Math.max(-MAX_GOAL_MODE_PERCENTAGE, customPercentage),
      );
      // Negated: a positive user percentage means "eat more" = a surplus.
      return -clamped / 100;
    }
    case "maintain":
    default:
      return 0.0;
  }
}

/**
 * Maps the onboarding "primary goal" answer onto a goal mode.
 *
 * Deliberately conservative: the gentlest option in each direction, since
 * onboarding never asks how fast the user wants to move.
 */
export function goalModeFromPrimaryGoal(primaryGoal: string): GoalMode {
  switch (primaryGoal) {
    case "lose_weight":
      return "cut";
    case "gain_weight":
      return "lean_bulk";
    case "maintain_weight":
    default:
      return "maintain";
  }
}

/** True for goal modes that target weight gain rather than loss. */
export function isGainGoalMode(
  goalMode: string,
  customPercentage: number = 0,
): boolean {
  return getGoalModeAdjustment(goalMode, customPercentage) < 0;
}

export type BmrCalculatorFn = (
  algorithm: string,
  weight: number,
  height: number,
  age: number,
  gender: "male" | "female",
  bodyFatPercentage?: number | null,
) => number;

export function calculateBmr(
  algorithm: string,
  weightKg?: number | null,
  heightCm?: number | null,
  age?: number | null,
  gender?: "male" | "female" | null,
  bodyFatPercentage?: number | null,
): number {
  if (algorithm === "Katch-McArdle" || algorithm === "Cunningham") {
    if (!weightKg || !bodyFatPercentage) {
      return 0;
    }
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return algorithm === "Katch-McArdle" ? 370 + 21.6 * lbm : 500 + 22 * lbm;
  }

  if (!weightKg || !heightCm || !age || !gender) {
    return 0;
  }

  if (algorithm === "Revised Harris-Benedict") {
    if (gender === "male") {
      return 13.397 * weightKg + 4.799 * heightCm - 5.677 * age + 88.362;
    } else {
      return 9.247 * weightKg + 3.098 * heightCm - 4.33 * age + 447.593;
    }
  }

  if (algorithm === "Oxford") {
    return gender === "male" ? 14.2 * weightKg + 593 : 10.9 * weightKg + 677;
  }

  // Default: Mifflin-St Jeor
  const genderOffset = gender === "male" ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset;
}

export function calculateMinimumMetabolism(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female",
  bodyFatPercentage?: number | null,
  bmrAlgorithm: string = "Mifflin-St Jeor",
  calculateBmrFn?: BmrCalculatorFn,
): number {
  const activeBmrFn = calculateBmrFn || calculateBmr;
  if (
    (bmrAlgorithm === "Katch-McArdle" || bmrAlgorithm === "Cunningham") &&
    bodyFatPercentage &&
    bodyFatPercentage > 0
  ) {
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return bmrAlgorithm === "Cunningham" ? 500 + 22 * lbm : 370 + 21.6 * lbm;
  }

  return activeBmrFn(
    bmrAlgorithm,
    weightKg,
    heightCm,
    age,
    gender,
    bodyFatPercentage,
  );
}

export interface CalorieTargetResult {
  target: number;
  rmr: number;
  baselineTdee: number;
  /** Signed: positive is a deficit, negative is a surplus. */
  appliedDeficit: number;
  isBelowRmr: boolean;
  isBelowAbsoluteFloor: boolean;
  absoluteFloorValue: number;
  finalTarget: number;
  insufficientHistory: boolean;
  /** Signed projection: negative is weight loss, positive is weight gain. */
  projectedWeeklyChangeKg: number;
  /** Magnitude of the projection as a percentage of body weight. Always >= 0. */
  projectedWeeklyChangePercent: number;
  /** True when the goal targets weight gain. */
  isGainGoal: boolean;
  /** Rate-of-change safety rating, thresholded per direction. */
  safetyZone: "green" | "yellow" | "red";
  /**
   * True when the adaptive safety floor overrode the requested target.
   * Only ever true for `calculationMethod === "adaptive"`.
   */
  wasClampedToFloor: boolean;
  /** Which floor bound: RMR, the flat absolute minimum, or a user override. */
  clampedFloorSource: "rmr" | "absolute" | "custom" | null;
  /** Recommended default (the higher of RMR and the sex-specific absolute floor). */
  recommendedSafetyFloor: number;
  /** Floor that is actually enforced, or null when automatic clamping is disabled. */
  effectiveSafetyFloor: number | null;
  /**
   * Largest deficit, in percent, that still clears the safety floor.
   *
   * Always present under the adaptive method, whether or not the current goal
   * mode trips the floor, so the UI can mark unreachable modes *before* one is
   * chosen rather than explaining the override afterwards. Null under manual,
   * which never clamps, and when the baseline is unknown.
   */
  maxFeasibleDeficitPercent: number | null;
}

/**
 * Whether a measured adaptive TDEE is settled enough to drive a calorie goal.
 *
 * `AdaptiveTdeeService` hands back a raw estimate at 7 qualifying days, but a goal
 * budget wants a stabler number than that. Every consumer that turns adaptive TDEE
 * into a target must ask this same question, so it lives here rather than being
 * re-expressed at each call site — they had already drifted apart once, with the
 * settings preview holding out for a mature estimate while the saved goal took the
 * raw one.
 *
 * Fails closed on an unknown fallback status. The service always populates the
 * flag, but the web types it as optional and pass it through unmodified, so a
 * partial or stale payload could otherwise let an estimate of unknown provenance
 * set someone's calorie target. Requiring an explicit `false` costs nothing when
 * the field is present and degrades to the estimated baseline when it is not.
 */
export function isAdaptiveTdeeMature(
  tdee: number | null | undefined,
  isFallback: boolean | null | undefined,
  daysOfData: number | null | undefined,
): tdee is number {
  return (
    typeof tdee === "number" &&
    Number.isFinite(tdee) &&
    tdee > 0 &&
    isFallback === false &&
    (daysOfData ?? 0) >= ADAPTIVE_TDEE_GOAL_MIN_DAYS
  );
}

export function resolveCalorieSafetyFloor(
  mode: CalorieSafetyFloorMode | string | null | undefined,
  customValue: number | null | undefined,
  standardFloor: number,
): number | null {
  if (mode === "disabled") return null;
  if (
    mode === "custom" &&
    Number.isInteger(customValue) &&
    Number(customValue) >= MIN_CALORIE_SAFETY_FLOOR &&
    Number(customValue) <= MAX_CALORIE_SAFETY_FLOOR
  ) {
    return Number(customValue);
  }
  return standardFloor;
}

export function getRecommendedCalorieSafetyFloor(
  rmr: number,
  gender: "male" | "female",
): number {
  return Math.max(rmr, getClinicalCalorieMinimum(gender));
}

export function getClinicalCalorieMinimum(gender: "male" | "female"): number {
  return gender === "female" ? 1200 : 1500;
}

/**
 * Whether a low-target warning is worth showing at all.
 *
 * Deliberately not gated on the calculation method. The floor only ever clamps
 * under `adaptive`, so gating on `manual` silenced the warning in exactly the
 * configurations that can land below RMR: a custom floor, or a disabled one.
 * Those are also the settings the smallest users depend on, because a clinical
 * minimum of 1200/1500 can sit above their entire maintenance.
 *
 * Callers pair this with the outcome (`finalTarget < rmr` and friends), which is
 * self-limiting: an unclamped adaptive target sits at or above its floor, so the
 * comparison is false and nothing renders.
 */
export function shouldShowCalorieSafetyWarning(goalMode: string): boolean {
  return goalMode !== "maintain";
}

export function computeCalorieTarget({
  goalMode,
  calculationMethod,
  customPercentage,
  bmr,
  activityLevelMultiplier,
  adaptiveTdee,
  adaptiveTdeeFallback,
  adaptiveTdeeDaysOfData,
  weightKg,
  heightCm,
  age,
  gender,
  bodyFatPercentage,
  bmrAlgorithm,
  currentGoalCalories,
  calculateBmrFn,
  calorieSafetyFloorMode = "standard",
  calorieSafetyFloorValue = DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
}: {
  goalMode: string;
  calculationMethod: string;
  customPercentage: number;
  bmr: number;
  activityLevelMultiplier: number;
  adaptiveTdee: number | null;
  adaptiveTdeeFallback: boolean;
  adaptiveTdeeDaysOfData: number;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: "male" | "female";
  bodyFatPercentage?: number | null;
  bmrAlgorithm?: string;
  currentGoalCalories: number;
  calculateBmrFn?: BmrCalculatorFn;
  calorieSafetyFloorMode?: CalorieSafetyFloorMode;
  calorieSafetyFloorValue?: number;
}): CalorieTargetResult {
  const rmr = calculateMinimumMetabolism(
    weightKg,
    heightCm,
    age,
    gender,
    bodyFatPercentage,
    bmrAlgorithm,
    calculateBmrFn,
  );
  // Signed: positive is a deficit, negative is a surplus.
  const deficitPercent = getGoalModeAdjustment(goalMode, customPercentage);

  let baselineTdee = currentGoalCalories;
  let insufficientHistory = false;

  if (calculationMethod === "adaptive") {
    if (
      !isAdaptiveTdeeMature(
        adaptiveTdee,
        adaptiveTdeeFallback,
        adaptiveTdeeDaysOfData,
      )
    ) {
      baselineTdee = Math.round(bmr * activityLevelMultiplier);
      insufficientHistory = true;
    } else {
      baselineTdee = adaptiveTdee;
    }
  }

  const calculatedTarget = baselineTdee * (1 - deficitPercent);
  const isGainGoal = deficitPercent < 0;
  const isBelowRmr = calculatedTarget < rmr;

  const absoluteFloorValue = getClinicalCalorieMinimum(gender);
  const isBelowAbsoluteFloor = calculatedTarget < absoluteFloorValue;

  // The floor is whichever is higher: the user's own resting metabolism, or the
  // flat minimum below which hitting protein and micronutrient targets is
  // impractical. A surplus can never trip it.
  const recommendedSafetyFloor = getRecommendedCalorieSafetyFloor(rmr, gender);
  const effectiveSafetyFloor = resolveCalorieSafetyFloor(
    calorieSafetyFloorMode,
    calorieSafetyFloorValue,
    recommendedSafetyFloor,
  );
  const wasClampedToFloor =
    calculationMethod === "adaptive" &&
    effectiveSafetyFloor !== null &&
    calculatedTarget < effectiveSafetyFloor;
  const finalTarget = wasClampedToFloor
    ? Math.round(effectiveSafetyFloor)
    : Math.round(calculatedTarget);

  // Name which floor actually bound, so the UI can explain rather than just clamp.
  const usesValidCustomFloor =
    calorieSafetyFloorMode === "custom" &&
    Number.isInteger(calorieSafetyFloorValue) &&
    calorieSafetyFloorValue >= MIN_CALORIE_SAFETY_FLOOR &&
    calorieSafetyFloorValue <= MAX_CALORIE_SAFETY_FLOOR;
  const clampedFloorSource: "rmr" | "absolute" | "custom" | null =
    wasClampedToFloor
      ? usesValidCustomFloor
        ? "custom"
        : rmr >= absoluteFloorValue
          ? "rmr"
          : "absolute"
      : null;

  // The largest deficit that still clears the floor. Computed whenever the floor
  // could bind — not only once it has — so a goal-mode picker can say which modes
  // are out of reach up front. Depends on the baseline and the floor, both of
  // which are independent of the goal mode, so it is the same for every mode.
  const maxFeasibleDeficitPercent =
    calculationMethod === "adaptive" &&
    baselineTdee > 0 &&
    effectiveSafetyFloor !== null
      ? Math.max(0, (1 - effectiveSafetyFloor / baselineTdee) * 100)
      : null;

  // Signed: negative is loss, positive is gain, matching how weight deltas read
  // elsewhere in the codebase. Uses the same energy density AdaptiveTdeeService
  // measures with, or the app would project consequences under a different
  // assumption than it calculates.
  const dailyEnergyBalance = finalTarget - baselineTdee;
  const projectedWeeklyChangeKg =
    (dailyEnergyBalance * 7) / ENERGY_DENSITY_KCAL_PER_KG;
  const projectedWeeklyChangePercent =
    weightKg > 0 ? (Math.abs(projectedWeeklyChangeKg) / weightKg) * 100 : 0;

  // Loss tolerates a faster rate than gain: beyond ~0.5%/week, added weight is
  // increasingly fat rather than muscle, so the gain thresholds are much tighter.
  const [yellowThreshold, redThreshold] = isGainGoal ? [0.25, 0.5] : [1.0, 1.5];
  let safetyZone: "green" | "yellow" | "red" = "green";
  if (projectedWeeklyChangePercent > redThreshold) {
    safetyZone = "red";
  } else if (projectedWeeklyChangePercent > yellowThreshold) {
    safetyZone = "yellow";
  }

  return {
    target: Math.round(calculatedTarget),
    rmr: Math.round(rmr),
    baselineTdee: Math.round(baselineTdee),
    appliedDeficit: Math.round(baselineTdee * deficitPercent),
    isBelowRmr,
    isBelowAbsoluteFloor,
    absoluteFloorValue,
    finalTarget,
    insufficientHistory,
    projectedWeeklyChangeKg,
    projectedWeeklyChangePercent,
    isGainGoal,
    safetyZone,
    wasClampedToFloor,
    clampedFloorSource,
    recommendedSafetyFloor: Math.round(recommendedSafetyFloor),
    effectiveSafetyFloor:
      effectiveSafetyFloor === null ? null : Math.round(effectiveSafetyFloor),
    maxFeasibleDeficitPercent,
  };
}
