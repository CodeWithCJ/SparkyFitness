import bmrService from './bmrService.js';
import { log } from '../config/logging.js';
import { ageOnDay } from '../utils/dateHelpers.js';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
  CalorieGoalAdjustmentMode,
} from '@workspace/shared';
import {
  CALORIE_CALCULATION_CONSTANTS,
  instantHourMinute,
  instantToDay,
  entryCaloriesCounted,
  resolveExerciseCalories,
  computeSparkyfitnessBurned,
  computeCaloriesRemaining,
  computeCalorieProgress,
  getGoalModeDailyAdjustment,
  getRecommendedCalorieSafetyFloor,
  isUsableMeasuredBmr,
  MAX_HEALTH_TOTAL_CALORIES_PER_DAY,
  MIN_CALORIE_SAFETY_FLOOR,
  resolveCalorieSafetyFloor,
  isAdaptiveEarnBackSuppressed,
  isAdaptiveActivitySeparated,
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
  adaptive_activity_separate?: boolean | null;
  timezone?: string | null;
  activity_level?: string | null;
  bmr_algorithm?: string | null;
  include_bmr_in_net_calories?: boolean | null;
  /** Opt-in for letting a synced/measured BMR replace the chosen formula. */
  use_external_bmr?: boolean | null;
  calorie_goal_adjustment_mode?: CalorieGoalAdjustmentMode | string | null;
  exercise_calorie_percentage?: number | null;
  tdee_allow_negative_adjustment?: boolean | null;
  goal_mode?: string | null;
  goal_mode_calculation_method?: string | null;
  goal_mode_custom_percentage?: number | null;
  goal_mode_weekly_change_kg?: number | null;
  calorie_safety_floor_mode?: string | null;
  calorie_safety_floor_value?: number | null;
}

export interface CalorieBalanceMeasurements {
  weight?: string | number | null;
  height?: string | number | null;
  body_fat_percentage?: string | number | null;
  bmr?: string | number | null;
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
  /** The calendar day balanced, 'YYYY-MM-DD'. */
  date: string;
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
  /** Device total (resting + active) calories accumulated for this day, from one source (see `pickDeviceTotalPerDay`). */
  deviceTotalCalories?: number | null;
  /** Fraction of the day elapsed when the cumulative device total was captured. */
  deviceTotalDayFraction?: number | null;
  /**
   * Fraction of the day elapsed, 0..1. Used only by the tdee/smart projection.
   * See `resolveDayFraction` -- pass 1 for a completed day.
   */
  dayFraction: number;
}

export interface BmrInputs {
  age: number;
  gender: string;
  weightKg: number;
  heightCm: number;
  bodyFatPercentage?: number;
}

/**
 * The body inputs the BMR formula uses on `date`, with the defaults applied.
 * Shared with the daily summary so the Diary explains the BMR with these same
 * values. Age is taken on that day, so a birthday does not move past days.
 */
export function resolveBmrInputs(
  userProfile: CalorieBalanceUserProfile | null,
  measurements: CalorieBalanceMeasurements | null,
  date: string
): BmrInputs {
  return {
    age: ageOnDay(userProfile?.date_of_birth, date) ?? 30,
    gender: userProfile?.gender || 'male',
    weightKg:
      parseFloat(String(measurements?.weight ?? '')) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG,
    heightCm:
      parseFloat(String(measurements?.height ?? '')) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM,
    bodyFatPercentage: measurements?.body_fat_percentage
      ? parseFloat(String(measurements.body_fat_percentage))
      : undefined,
  };
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

export interface DeviceProjectionTotal {
  totalCalories?: number | string | null;
  capturedAt?: Date | string | null;
}

export interface DeviceProjectionSnapshotInputs {
  date: string;
  timezone: string;
  deviceTotal?: DeviceProjectionTotal | null;
  now?: Date;
}

/**
 * Prepares the shared clock-sensitive inputs for Device Projection.
 *
 * The device total is cumulative, so today's value must be extrapolated from
 * the instant at which that value was captured. Completed days are final and
 * resolve to a fraction of 1 through `resolveDayFraction`.
 */
export function resolveDeviceProjectionSnapshot({
  date,
  timezone,
  deviceTotal,
  now = new Date(),
}: DeviceProjectionSnapshotInputs): Pick<
  CalorieBalanceInputs,
  'deviceTotalCalories' | 'deviceTotalDayFraction' | 'dayFraction'
> {
  const dayFraction = resolveDayFraction(date, timezone, now);
  const isCompletedDay = date < instantToDay(now, timezone);
  const capturedAt = deviceTotal?.capturedAt
    ? new Date(deviceTotal.capturedAt)
    : null;
  const hasValidCaptureTime =
    capturedAt !== null && Number.isFinite(capturedAt.getTime());
  const totalCalories = Number(deviceTotal?.totalCalories);

  return {
    deviceTotalCalories:
      Number.isFinite(totalCalories) && totalCalories > 0
        ? totalCalories
        : null,
    deviceTotalDayFraction: isCompletedDay
      ? 1
      : hasValidCaptureTime
        ? resolveDayFraction(date, timezone, capturedAt)
        : dayFraction,
    dayFraction,
  };
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
      const cal = entryCaloriesCounted(session);
      if (session.name === ACTIVE_CALORIES_EXERCISE_NAME) {
        activeCalories += cal;
      } else {
        otherCalories += cal;
      }
      activitySteps += session.steps || 0;
    } else {
      for (const exercise of session.exercises) {
        otherCalories += entryCaloriesCounted(exercise);
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

/**
 * Calculates daily energy totals, the effective goal, and remaining calories.
 * Adaptive targets with a positive BMR already include full-day expenditure, so
 * Dynamic and Percentage modes do not add activity or optional BMR credit again.
 * Without a positive BMR, those modes keep their existing earn-back behavior.
 * Explicit Device Projection modes continue to use their device-based goal.
 */
export function computeCalorieBalance({
  date,
  eatenCalories,
  exercise,
  backgroundStepCalories,
  adjustedGoalCalories,
  userProfile,
  userPreferences,
  measurements,
  deviceTotalCalories,
  deviceTotalDayFraction,
  dayFraction,
}: CalorieBalanceInputs): CalorieBalance {
  // 1. BMR
  let bmr = 0;
  const activityLevel = userPreferences?.activity_level || 'not_much';
  const includeInNet = userPreferences?.include_bmr_in_net_calories || false;

  if (userProfile && userPreferences) {
    const bmrAlgorithm = userPreferences.bmr_algorithm || 'Mifflin-St Jeor';
    const { age, gender, weightKg, heightCm, bodyFatPercentage } =
      resolveBmrInputs(userProfile, measurements, date);

    try {
      bmr = bmrService.calculateBmr(
        bmrAlgorithm,
        weightKg,
        heightCm,
        age,
        gender,
        bodyFatPercentage
      );
    } catch (error: unknown) {
      log(
        'warn',
        `calorieBalanceService: BMR calc failed: ${(error as Error).message}`
      );
    }
  }

  // 1b. Measured BMR override — when a measured BMR was recorded on this day
  // (smart scale, health provider sync, or manual check-in entry), prefer it over
  // the formula. `measurements.bmr` is resolved for this exact date, never carried
  // forward, so "measured" always means a reading actually taken on the day shown.
  // `bmr` still holds the formula estimate here, which is what the measured value
  // is sanity-checked against.
  let bmrSource: 'formula' | 'measured' = 'formula';
  if (
    userPreferences?.use_external_bmr &&
    isUsableMeasuredBmr(measurements?.bmr, bmr)
  ) {
    bmr = parseFloat(String(measurements!.bmr));
    bmrSource = 'measured';
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
  let goalCalories = adjustedGoalCalories;

  let tdeeAdjustment = 0;
  let tdeeProjection: CalorieBalance['tdeeProjection'] = null;
  if (adjustmentMode === 'tdee' || adjustmentMode === 'smart') {
    const deviceCaptureFraction = deviceTotalDayFraction ?? dayFraction;
    const projectedDeviceTotal =
      typeof deviceTotalCalories === 'number' &&
      Number.isFinite(deviceTotalCalories) &&
      deviceCaptureFraction >= MIN_DAY_FRACTION
        ? Math.round(deviceTotalCalories / deviceCaptureFraction)
        : null;
    const validDeviceTotal =
      typeof deviceTotalCalories === 'number' &&
      Number.isFinite(deviceTotalCalories) &&
      deviceTotalCalories > 0 &&
      deviceTotalCalories <= MAX_HEALTH_TOTAL_CALORIES_PER_DAY &&
      deviceTotalCalories >= exerciseCaloriesBurned &&
      deviceCaptureFraction >= MIN_DAY_FRACTION &&
      projectedDeviceTotal !== null &&
      projectedDeviceTotal >= Math.max(bmr * 0.5, MIN_CALORIE_SAFETY_FLOOR) &&
      projectedDeviceTotal <= MAX_HEALTH_TOTAL_CALORIES_PER_DAY;
    const projectedDeviceCalories =
      dayFraction >= MIN_DAY_FRACTION && exerciseCaloriesBurned > 0
        ? Math.round(exerciseCaloriesBurned / dayFraction)
        : exerciseCaloriesBurned;

    const projectedBurn =
      validDeviceTotal && projectedDeviceTotal !== null
        ? projectedDeviceTotal
        : bmr + projectedDeviceCalories;
    const goalModeAdjustment = getGoalModeDailyAdjustment(
      userPreferences?.goal_mode || 'maintain',
      userPreferences?.goal_mode_custom_percentage ?? 0,
      projectedBurn,
      userPreferences?.goal_mode_weekly_change_kg ?? 0
    );
    let projectedTarget = Math.round(projectedBurn + goalModeAdjustment);
    if (
      userPreferences?.goal_mode_calculation_method === 'adaptive' ||
      userPreferences?.goal_mode === 'weekly'
    ) {
      const safetyFloor = resolveCalorieSafetyFloor(
        userPreferences.calorie_safety_floor_mode,
        userPreferences.calorie_safety_floor_value,
        getRecommendedCalorieSafetyFloor(
          bmr,
          userProfile?.gender === 'female' ? 'female' : 'male'
        )
      );
      if (safetyFloor !== null) {
        projectedTarget = Math.max(projectedTarget, Math.round(safetyFloor));
      }
    }
    const projectedTargetAdjustment = projectedTarget - adjustedGoalCalories;

    // A valid cumulative total is the direct TDEE baseline selected by Device
    // Projection, so it is allowed to move the target in either direction. The
    // legacy BMR + active fallback keeps the existing opt-in for downward moves.
    tdeeAdjustment = validDeviceTotal
      ? projectedTargetAdjustment
      : allowNegativeAdjustment
        ? projectedTargetAdjustment
        : Math.max(0, projectedTargetAdjustment);
    goalCalories = adjustedGoalCalories + tdeeAdjustment;
    tdeeProjection = {
      projectedBurn,
      baselineBurn: sparkyfitnessBurned,
      adjustment: tdeeAdjustment,
      targetCalories: goalCalories,
      // 'health_connect_total' means any device total now (Garmin and Polar
      // too); the value stays because older apps check for it.
      source: validDeviceTotal ? 'health_connect_total' : 'active_plus_bmr',
    };
  }

  // 4. Remaining & progress
  // Adaptive targets already use full-day expenditure, including activity and
  // resting energy (also when falling back to BMR x activity level). Crediting
  // either again would erase the intended deficit. Explicit Device Projection
  // still replaces that target with its own full-day estimate above.
  const budgetMode =
    bmr > 0 &&
    isAdaptiveEarnBackSuppressed(
      adjustmentMode,
      userPreferences?.goal_mode_calculation_method,
      userPreferences?.adaptive_activity_separate
    )
      ? 'adaptive'
      : adjustmentMode;
  const remaining = computeCaloriesRemaining({
    mode: budgetMode,
    // TDEE mode expresses its live target as base goal + adjustment. Passing
    // the already-adjusted live goal here would apply the adjustment twice.
    goalCalories:
      adjustmentMode === 'tdee' || adjustmentMode === 'smart'
        ? adjustedGoalCalories
        : goalCalories,
    eatenCalories,
    // The learned baseline already includes resting expenditure. Only today's
    // resolved activity is earned back; BMR remains in the reporting statistics.
    netCalories:
      bmr > 0 &&
      isAdaptiveActivitySeparated(
        adjustmentMode,
        userPreferences?.goal_mode_calculation_method,
        userPreferences?.adaptive_activity_separate
      )
        ? eatenCalories - exerciseCaloriesBurned
        : netCalories,
    exerciseCaloriesBurned,
    bmrCalories,
    exerciseCaloriePercentage,
    tdeeAdjustment,
  });

  const progress = computeCalorieProgress(eatenCalories, remaining);

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

/** Positive budget earned from activity, excluding resting-only projection changes. */
export function computeExerciseMacroCredit(
  inputs: CalorieBalanceInputs
): number {
  const activity = resolveExerciseCalories(
    inputs.exercise.otherCalories,
    inputs.exercise.activeCalories,
    inputs.backgroundStepCalories
  ).calories;
  if (activity <= 0) return 0;
  const macroInputs: CalorieBalanceInputs = {
    ...inputs,
    eatenCalories: 0,
    userPreferences: {
      ...inputs.userPreferences,
      include_bmr_in_net_calories: false,
    },
  };
  const actual = computeCalorieBalance(macroInputs);
  const withoutActivity = computeCalorieBalance({
    ...macroInputs,
    exercise: { activeCalories: 0, otherCalories: 0, activitySteps: 0 },
    backgroundStepCalories: 0,
    deviceTotalCalories:
      typeof inputs.deviceTotalCalories === 'number'
        ? Math.max(0, inputs.deviceTotalCalories - activity)
        : inputs.deviceTotalCalories,
  });
  return Math.max(
    0,
    actual.remaining -
      Math.max(inputs.adjustedGoalCalories, withoutActivity.remaining)
  );
}
