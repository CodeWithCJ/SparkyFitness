import bmrService from './bmrService.js';
import { log } from '../config/logging.js';
import { userAge } from '../utils/dateHelpers.js';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
  CalorieGoalAdjustmentMode,
} from '@workspace/shared';
import {
  CALORIE_CALCULATION_CONSTANTS,
  instantHourMinute,
  instantToDay,
  resolveExerciseCalories,
  computeSparkyfitnessBurned,
  computeCaloriesRemaining,
  computeCalorieProgress,
  computeTdeeAdjustment,
} from '@workspace/shared';

/**
 * The one implementation of "what is this day's calorie balance".
 *
 * Extracted from `dailySummaryService` so the per-date path (the Diary, web and mobile)
 * and the ranged path (Reports) cannot compute it differently. Issue #2094 was reopened
 * because the Reports page carried its own copy in the browser: it summed every exercise
 * entry instead of taking `resolveExerciseCalories`' max(), never saw step calories, and
 * ignored `include_bmr_in_net_calories` entirely. Three inputs, three divergences. A
 * second implementation of this rule always drifts, so there is deliberately only one,
 * and it is pure -- every input arrives as an argument.
 */

export interface CalorieBalanceUserProfile {
  date_of_birth?: string | null;
  gender?: string | null;
}

export interface CalorieBalanceUserPreferences {
  timezone?: string | null;
  activity_level?: string | null;
  bmr_algorithm?: string | null;
  include_bmr_in_net_calories?: boolean | null;
  use_external_bmr?: boolean | null;
  calorie_goal_adjustment_mode?: CalorieGoalAdjustmentMode | string | null;
  exercise_calorie_percentage?: number | null;
  tdee_allow_negative_adjustment?: boolean | null;
}

export interface CalorieBalanceMeasurements {
  weight?: string | number | null;
  height?: string | number | null;
  body_fat_percentage?: string | number | null;
}

export interface ExerciseCalorieStats {
  activeCalories: number;
  otherCalories: number;
  activitySteps: number;
}

export interface FoodEntryCalorieLike {
  calories?: number | null;
  quantity?: number;
  serving_size?: number | null;
}

export interface CalorieBalanceInputs {
  /** Food + supplement kcal for the day, already scaled by quantity/serving size. */
  eatenCalories: number;
  /** The day's exercise entries, split by source. */
  exercise: ExerciseCalorieStats;
  /** kcal from steps no logged workout accounts for. 0 when checkin is not permitted. */
  backgroundStepCalories: number;
  /** The `adjust=true` calorie goal from goalService for this day. */
  adjustedGoalCalories: number;
  userProfile: CalorieBalanceUserProfile | null;
  userPreferences: CalorieBalanceUserPreferences | null;
  /** Latest measurement on or before the day. Drives the BMR formula. */
  measurements: CalorieBalanceMeasurements | null;
  /** Synced resting/BMR for the day, or null. */
  externalBmr: number | null;
  /**
   * Fraction of the day elapsed, 0..1. Used only by the tdee/smart projection.
   * See `resolveDayFraction` -- pass 1 for a completed day.
   */
  dayFraction: number;
}

/** Below this the day is too young to extrapolate from without wild swings (~72 min). */
const MIN_DAY_FRACTION = CALORIE_CALCULATION_CONSTANTS.MIN_DAY_FRACTION;

/** A synced device summary logs under this exercise name. */
const ACTIVE_CALORIES_EXERCISE_NAME = 'Active Calories';

/**
 * How much of `date` has elapsed, for the tdee/smart end-of-day projection.
 *
 * A finished day needs no extrapolation -- its actual burn *is* its full-day burn -- so
 * any past day returns 1 and is therefore reproducible. Reading the wall clock for a past
 * day (which is what this code did before) made the same historical day report different
 * numbers at 6am and at 11pm, and made it impossible for Reports to ever agree with the
 * Diary. Today keeps the live clock so the last point on a chart matches the Diary at the
 * same instant.
 */
export function resolveDayFraction(
  date: string,
  tz: string,
  now: Date = new Date()
): number {
  const today = instantToDay(now, tz);
  if (date < today) return 1;

  const { hour, minute } = instantHourMinute(now, tz);
  return (hour * 60 + minute) / (24 * 60);
}

/**
 * Splits a day's exercise sessions into the three sums the balance needs.
 *
 * The device's "Active Calories" summary is kept apart from logged workouts because it
 * already includes them -- adding the two is the double count behind #2094. Preset
 * sessions fold wholesale into `otherCalories`: a preset is a user-built workout, so its
 * children are logged exercise regardless of what any child happens to be named.
 */
export function extractExerciseStats(
  sessions: readonly ExerciseSessionResponse[]
): ExerciseCalorieStats {
  let activeCalories = 0;
  let otherCalories = 0;
  let activitySteps = 0;

  for (const session of sessions) {
    if (session.type === 'individual') {
      const cal = session.calories_burned || 0;
      if (session.name === ACTIVE_CALORIES_EXERCISE_NAME) {
        activeCalories += cal;
      } else {
        otherCalories += cal;
      }
      activitySteps += session.steps || 0;
    } else {
      for (const exercise of session.exercises) {
        otherCalories += exercise.calories_burned || 0;
        activitySteps += exercise.steps || 0;
      }
    }
  }

  return { activeCalories, otherCalories, activitySteps };
}

/**
 * Scales per-serving calorie values by the logged quantity.
 *
 * Split out so the ranged path can feed an already-summed per-day figure from the
 * reports nutrition query instead of re-fetching every food entry for every day.
 */
export function sumFoodEntryCalories(
  entries: readonly FoodEntryCalorieLike[]
): number {
  return entries.reduce((sum, entry) => {
    const cal = entry.calories || 0;
    const qty = entry.quantity || 0;
    const servingSize = entry.serving_size || 100;
    return sum + (cal * qty) / servingSize;
  }, 0);
}

export function computeCalorieBalance({
  eatenCalories,
  exercise,
  backgroundStepCalories,
  adjustedGoalCalories,
  userProfile,
  userPreferences,
  measurements,
  externalBmr,
  dayFraction,
}: CalorieBalanceInputs): CalorieBalance {
  // 1. BMR
  let bmr = 0;
  const activityLevel = userPreferences?.activity_level || 'not_much';
  const includeInNet = userPreferences?.include_bmr_in_net_calories || false;
  const useExternalBmr = userPreferences?.use_external_bmr || false;

  if (userProfile && userPreferences) {
    const tz = userPreferences.timezone || 'UTC';
    const age = userAge(userProfile.date_of_birth ?? '', tz) ?? 30;
    const gender = userProfile.gender || 'male';
    const bmrAlgorithm = userPreferences.bmr_algorithm || 'Mifflin-St Jeor';
    const weightKg =
      parseFloat(String(measurements?.weight ?? '')) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG;
    const heightCm =
      parseFloat(String(measurements?.height ?? '')) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM;
    const bodyFat = measurements?.body_fat_percentage
      ? parseFloat(String(measurements.body_fat_percentage))
      : undefined;

    try {
      bmr = bmrService.calculateBmr(
        bmrAlgorithm,
        weightKg,
        heightCm,
        age,
        gender,
        bodyFat
      );
    } catch (error: unknown) {
      log(
        'warn',
        `calorieBalanceService: BMR calc failed: ${(error as Error).message}`
      );
    }
  }

  // 1b. External BMR override — when the user opts in and a synced resting/BMR value
  // exists for the day, prefer it over the formula. Sanity-bounded so a bad sample
  // can't zero out the target; otherwise we keep the formula.
  let bmrSource: 'formula' | 'external' = 'formula';
  if (
    useExternalBmr &&
    externalBmr !== null &&
    externalBmr >= 600 &&
    externalBmr <= 6000
  ) {
    bmr = externalBmr;
    bmrSource = 'external';
  }

  // 2. Resolve exercise calories (3-tier fallback). max(active, logged + steps) —
  // never the sum, because a device's "Active Calories" already contains both.
  const resolved = resolveExerciseCalories(
    exercise.otherCalories,
    exercise.activeCalories,
    backgroundStepCalories
  );

  const exerciseCaloriesBurned = resolved.calories;
  const bmrCalories = includeInNet && bmr ? bmr : 0;
  const totalBurned = exerciseCaloriesBurned + bmrCalories;
  const netCalories = eatenCalories - totalBurned;

  // 3. Goal adjustment — the goal itself is already calculated by goalService.
  const adjustmentMode = (userPreferences?.calorie_goal_adjustment_mode ||
    'dynamic') as CalorieGoalAdjustmentMode;
  const exerciseCaloriePercentage =
    userPreferences?.exercise_calorie_percentage ?? 100;
  const allowNegativeAdjustment =
    userPreferences?.tdee_allow_negative_adjustment ?? false;

  const sparkyfitnessBurned = computeSparkyfitnessBurned(bmr, activityLevel);
  const goalCalories = adjustedGoalCalories;

  let tdeeAdjustment = 0;
  let tdeeProjection: CalorieBalance['tdeeProjection'] = null;
  if (adjustmentMode === 'tdee' || adjustmentMode === 'smart') {
    const projectedDeviceCalories =
      dayFraction >= MIN_DAY_FRACTION && exerciseCaloriesBurned > 0
        ? Math.round(exerciseCaloriesBurned / dayFraction)
        : exerciseCaloriesBurned;

    const projectedBurn = bmr + projectedDeviceCalories;
    tdeeAdjustment = computeTdeeAdjustment(
      projectedBurn,
      sparkyfitnessBurned,
      allowNegativeAdjustment
    );
    tdeeProjection = {
      projectedBurn,
      baselineBurn: sparkyfitnessBurned,
      adjustment: tdeeAdjustment,
    };
  }

  // 4. Remaining & progress
  const remaining = computeCaloriesRemaining({
    mode: adjustmentMode,
    goalCalories,
    eatenCalories,
    netCalories,
    exerciseCaloriesBurned,
    bmrCalories,
    exerciseCaloriePercentage,
    tdeeAdjustment,
  });

  const progress = computeCalorieProgress(goalCalories, remaining);

  return {
    eaten: Math.round(eatenCalories),
    burned: Math.round(totalBurned),
    remaining: Math.round(remaining),
    goal: Math.round(goalCalories),
    net: Math.round(netCalories),
    progress: Math.round(progress),
    bmr: Math.round(bmr),
    bmrSource,
    exerciseSource: resolved.source,
    tdeeProjection,
  };
}
