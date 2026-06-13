import { ACTIVITY_MULTIPLIERS } from "../constants/calorieConstants.ts";

export type CalorieGoalAdjustmentMode =
  | "dynamic"
  | "fixed"
  | "percentage"
  | "tdee"
  | "smart"
  | "adaptive";

export type ExerciseCalorieSource = "logged" | "active" | "steps" | "none";

export interface ResolvedExerciseCalories {
  calories: number;
  source: ExerciseCalorieSource;
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

export type GoalMode = "maintain" | "recomp" | "cut" | "high_cut" | "manual";
export type GoalModeCalculationMethod = "adaptive" | "manual";

export function getGoalModeDeficit(goalMode: string, customPercentage: number = 0): number {
  switch (goalMode) {
    case "recomp":
      return 0.10;
    case "cut":
      return 0.15;
    case "high_cut":
      return 0.20;
    case "manual":
      return Math.min(40, Math.max(0, customPercentage)) / 100;
    case "maintain":
    default:
      return 0.0;
  }
}

export type BmrCalculatorFn = (
  algorithm: string,
  weight: number,
  height: number,
  age: number,
  gender: "male" | "female",
  bodyFatPercentage?: number | null
) => number;

export function calculateBmr(
  algorithm: string,
  weightKg?: number | null,
  heightCm?: number | null,
  age?: number | null,
  gender?: "male" | "female" | null,
  bodyFatPercentage?: number | null
): number {
  if (
    algorithm === "Katch-McArdle" ||
    algorithm === "Cunningham"
  ) {
    if (!weightKg || !bodyFatPercentage) {
      return 0;
    }
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return algorithm === "Katch-McArdle"
      ? 370 + 21.6 * lbm
      : 500 + 22 * lbm;
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
  calculateBmrFn?: BmrCalculatorFn
): number {
  if (bodyFatPercentage && bodyFatPercentage > 0) {
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return bmrAlgorithm === "Cunningham"
      ? 500 + 22 * lbm
      : 370 + 21.6 * lbm;
  }

  const activeBmrFn = calculateBmrFn || calculateBmr;
  return activeBmrFn(bmrAlgorithm, weightKg, heightCm, age, gender, bodyFatPercentage);
}

export interface CalorieTargetResult {
  target: number;
  rmr: number;
  baselineTdee: number;
  appliedDeficit: number;
  isBelowRmr: boolean;
  isBelowAbsoluteFloor: boolean;
  absoluteFloorValue: number;
  finalTarget: number;
  insufficientHistory: boolean;
  projectedWeeklyLossKg: number;
  projectedWeeklyLossPercent: number;
  lossSafetyZone: "green" | "yellow" | "red";
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
  calculateBmrFn
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
}): CalorieTargetResult {
  const rmr = calculateMinimumMetabolism(weightKg, heightCm, age, gender, bodyFatPercentage, bmrAlgorithm, calculateBmrFn);
  const deficitPercent = getGoalModeDeficit(goalMode, customPercentage);

  let baselineTdee = currentGoalCalories;
  let insufficientHistory = false;

  if (calculationMethod === "adaptive") {
    if (adaptiveTdeeFallback || !adaptiveTdee || adaptiveTdeeDaysOfData < 14) {
      baselineTdee = Math.round(bmr * activityLevelMultiplier);
      insufficientHistory = true;
    } else {
      baselineTdee = adaptiveTdee;
    }
  }

  const calculatedTarget = baselineTdee * (1 - deficitPercent);
  const isBelowRmr = calculatedTarget < rmr;

  const absoluteFloorValue = gender === "female" ? 1200 : 1500;
  const isBelowAbsoluteFloor = calculatedTarget < absoluteFloorValue;

  const safetyFloor = Math.max(bmr, absoluteFloorValue);
  const finalTarget = (calculationMethod === "adaptive" && calculatedTarget < safetyFloor)
    ? Math.round(safetyFloor)
    : Math.round(calculatedTarget);

  const dailyDeficit = Math.max(0, baselineTdee - finalTarget);
  const projectedWeeklyLossKg = (dailyDeficit * 7) / 7700;
  const projectedWeeklyLossPercent = weightKg > 0 ? (projectedWeeklyLossKg / weightKg) * 100 : 0;

  let lossSafetyZone: "green" | "yellow" | "red" = "green";
  if (projectedWeeklyLossPercent > 1.5) {
    lossSafetyZone = "red";
  } else if (projectedWeeklyLossPercent > 1.0) {
    lossSafetyZone = "yellow";
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
    projectedWeeklyLossKg,
    projectedWeeklyLossPercent,
    lossSafetyZone
  };
}
