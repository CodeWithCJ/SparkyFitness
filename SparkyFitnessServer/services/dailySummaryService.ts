import goalService from './goalService.js';
import foodEntryService from './foodEntryService.js';
import { getExerciseEntriesByDateV2 } from './exerciseEntryHistoryService.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import bmrService from './bmrService.js';
import { log } from '../config/logging.js';
import { userAge } from '../utils/dateHelpers.js';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
} from '@workspace/shared';
import {
  CALORIE_CALCULATION_CONSTANTS,
  userHourMinute,
  resolveExerciseCalories,
  computeSparkyfitnessBurned,
  computeCaloriesRemaining,
  computeCalorieProgress,
  computeTdeeAdjustment,
} from '@workspace/shared';
import type { CalorieGoalAdjustmentMode } from '@workspace/shared';

interface DailySummaryOptions {
  actorUserId: string;
  targetUserId: string;
  date: string;
  includeCheckin: boolean;
}

/**
 * Extracts activeCalories, otherCalories, and activitySteps from exercise sessions.
 */
function extractExerciseStats(sessions: ExerciseSessionResponse[]) {
  let activeCalories = 0;
  let otherCalories = 0;
  let activitySteps = 0;

  for (const session of sessions) {
    if (session.type === 'individual') {
      const cal = session.calories_burned || 0;
      if (session.name === 'Active Calories') {
        activeCalories += cal;
      } else {
        otherCalories += cal;
      }
      activitySteps += session.steps || 0;
    } else {
      // preset session — aggregate from nested exercises
      for (const exercise of session.exercises) {
        otherCalories += exercise.calories_burned || 0;
        activitySteps += exercise.steps || 0;
      }
    }
  }

  return { activeCalories, otherCalories, activitySteps };
}

/**
 * Computes the calorie balance object for the daily summary.
 */
function computeCalorieBalance(
  foodEntries: Array<{
    calories?: number | null;
    quantity?: number;
    serving_size?: number | null;
  }>,
  exerciseSessions: ExerciseSessionResponse[],
  stepCalories: number,
  goals: { calories?: number | null },
  adjustedGoalCalories: number,
  userProfile: { date_of_birth?: string; gender?: string } | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userPreferences: Record<string, any> | null,
  measurements: {
    weight?: string | number;
    height?: string | number;
    body_fat_percentage?: string | number;
  } | null,
  externalBmr: number | null
): CalorieBalance {
  // 1. Eaten calories — scale per-serving values by quantity/serving_size
  const eatenCalories = foodEntries.reduce((sum, e) => {
    const cal = e.calories || 0;
    const qty = e.quantity || 0;
    const servingSize = e.serving_size || 100;
    return sum + (cal * qty) / servingSize;
  }, 0);

  // 2. Exercise stats
  const { activeCalories, otherCalories } =
    extractExerciseStats(exerciseSessions);

  // 3. BMR
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
        `dailySummaryService: BMR calc failed: ${(error as Error).message}`
      );
    }
  }

  // 3b. External BMR override — when the user opts in and a synced resting/BMR value
  // exists for the day, prefer it over the formula. Sanity-bounded so a bad sample
  // can't zero out the target; otherwise we keep the formula ("Otherwise, the selected
  // formula will be used.").
  let bmrSource = 'formula';
  if (
    useExternalBmr &&
    externalBmr !== null &&
    externalBmr >= 600 &&
    externalBmr <= 6000
  ) {
    bmr = externalBmr;
    bmrSource = 'external';
  }
  log(
    'debug',
    `dailySummaryService: BMR source=${bmrSource} value=${Math.round(bmr)}` +
      (useExternalBmr ? ` (externalAvailable=${externalBmr !== null})` : '')
  );

  // 4. Resolve exercise calories (3-tier fallback)
  const resolved = resolveExerciseCalories(
    otherCalories,
    activeCalories,
    stepCalories
  );

  const exerciseCaloriesBurned = resolved.calories;
  const bmrCalories = includeInNet && bmr ? bmr : 0;
  const totalBurned = exerciseCaloriesBurned + bmrCalories;
  const netCalories = eatenCalories - totalBurned;

  // 5. Goal adjustment - calculated by goalService
  const adjustmentMode: CalorieGoalAdjustmentMode =
    (userPreferences?.calorie_goal_adjustment_mode as CalorieGoalAdjustmentMode) ||
    'dynamic';
  const exerciseCaloriePercentage =
    userPreferences?.exercise_calorie_percentage ?? 100;
  const allowNegativeAdjustment =
    userPreferences?.tdee_allow_negative_adjustment ?? false;

  // Actual TDEE baseline (for TDEE mode projection)
  const sparkyfitnessBurned = computeSparkyfitnessBurned(bmr, activityLevel);

  const goalCalories = adjustedGoalCalories;

  // TDEE mode adjustment
  let tdeeAdjustment = 0;
  let tdeeProjection: CalorieBalance['tdeeProjection'] = null;
  if (adjustmentMode === 'tdee' || adjustmentMode === 'smart') {
    const tz = userPreferences?.timezone || 'UTC';
    const { hour, minute } = userHourMinute(tz);
    const minutesSinceMidnight = hour * 60 + minute;
    const dayFraction = minutesSinceMidnight / (24 * 60);

    const projectedDeviceCalories =
      dayFraction >= 0.05 && exerciseCaloriesBurned > 0
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

  // 6. Remaining & progress
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
    exerciseSource: resolved.source,
    tdeeProjection,
  };
}

export async function getDailySummary({
  actorUserId,
  targetUserId,
  date,
  includeCheckin,
}: DailySummaryOptions) {
  // Each function acquires its own pool client, allowing true parallel execution.
  const [
    goals,
    adjustedGoals,
    foodEntries,
    exerciseSessions,
    waterResult,
    userProfile,
    userPreferences,
    measurements,
  ] = await Promise.all([
    goalService.getUserGoals(targetUserId, date, undefined, false),
    goalService.getUserGoals(targetUserId, date, undefined, true),
    foodEntryService.getFoodEntriesByDate(actorUserId, targetUserId, date),
    getExerciseEntriesByDateV2(targetUserId, date),
    includeCheckin
      ? measurementRepository
          .getWaterIntakeByDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `Water intake fetch failed for user ${targetUserId} on ${date}, defaulting to 0:`,
              error
            );
            return null;
          })
      : null,
    userRepository.getUserProfile(targetUserId),
    preferenceRepository.getUserPreferences(targetUserId),
    includeCheckin
      ? measurementRepository
          .getLatestCheckInMeasurementsOnOrBeforeDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `Measurements fetch failed for user ${targetUserId} on ${date}:`,
              error
            );
            return null;
          })
      : null,
  ]);

  const stepCalories = includeCheckin
    ? await measurementRepository.getStepCaloriesForDate(
        targetUserId,
        date,
        exerciseSessions as ExerciseSessionResponse[]
      )
    : 0;

  // External BMR override — only when opted in AND checkin data is permitted
  // (includeCheckin is the route's permission gate; the override must not bypass it).
  const externalBmr =
    userPreferences?.use_external_bmr && includeCheckin
      ? await measurementRepository
          .getExternalBmrForDate(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `External BMR fetch failed for user ${targetUserId} on ${date}:`,
              error
            );
            return null;
          })
      : null;

  const calorieBalance = computeCalorieBalance(
    foodEntries,
    exerciseSessions as ExerciseSessionResponse[],
    stepCalories,
    goals,
    (adjustedGoals as any)?.calories
      ? parseFloat(String((adjustedGoals as any).calories))
      : 2000,
    userProfile,
    userPreferences,
    measurements,
    externalBmr
  );

  return {
    goals,
    foodEntries,
    exerciseSessions,
    waterIntake: parseFloat(waterResult?.water_ml) || 0,
    stepCalories,
    calorieBalance,
  };
}
