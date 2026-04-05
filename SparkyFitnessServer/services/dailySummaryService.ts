const goalService = require('./goalService');
const foodEntryService = require('./foodEntryService');
import { getExerciseEntriesByDateV2 } from './exerciseEntryHistoryService';
const measurementRepository = require('../models/measurementRepository');
const userRepository = require('../models/userRepository');
const preferenceRepository = require('../models/preferenceRepository');
const bmrService = require('./bmrService');
const adaptiveTdeeService = require('./AdaptiveTdeeService');
const { log } = require('../config/logging');
const { userAge } = require('../utils/dateHelpers');
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
  userProfile: { date_of_birth?: string; gender?: string } | null,
  userPreferences: Record<string, any> | null,
  measurements: {
    weight?: string | number;
    height?: string | number;
    body_fat_percentage?: string | number;
  } | null,
  adaptiveTdeeData: { tdee: number } | null
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

  if (userProfile && userPreferences) {
    const tz = userPreferences.timezone || 'UTC';
    const age = userAge(userProfile.date_of_birth, tz) ?? 30;
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

  // 5. Goal adjustment
  const rawGoalCalories = parseFloat(String(goals?.calories ?? '')) || 2000;
  const adjustmentMode: CalorieGoalAdjustmentMode =
    (userPreferences?.calorie_goal_adjustment_mode as CalorieGoalAdjustmentMode) ||
    'dynamic';
  const exerciseCaloriePercentage =
    userPreferences?.exercise_calorie_percentage ?? 100;
  const allowNegativeAdjustment =
    userPreferences?.tdee_allow_negative_adjustment ?? false;

  // Offset uses fixed 'not_much' baseline to prevent goal inversion when
  // the user changes their activity level setting.
  const baselineMaintenance = computeSparkyfitnessBurned(bmr, 'not_much');
  const calorieGoalOffset = bmr > 0 ? rawGoalCalories - baselineMaintenance : 0;

  // Actual TDEE baseline (for TDEE mode projection)
  const sparkyfitnessBurned = computeSparkyfitnessBurned(bmr, activityLevel);

  // Effective goal — adaptive mode uses adaptive TDEE + offset with safety floor
  let goalCalories = rawGoalCalories;
  if (adjustmentMode === 'adaptive' && adaptiveTdeeData && bmr > 0) {
    goalCalories = Math.max(
      1200,
      Math.round(adaptiveTdeeData.tdee + calorieGoalOffset)
    );
  }

  // TDEE mode adjustment
  let tdeeAdjustment = 0;
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
    foodEntries,
    exerciseSessions,
    waterResult,
    userProfile,
    userPreferences,
    measurements,
  ] = await Promise.all([
    goalService.getUserGoals(targetUserId, date),
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

  // Conditionally fetch adaptive TDEE only when the user's mode requires it
  const adjustmentMode = userPreferences?.calorie_goal_adjustment_mode;
  const adaptiveTdeeData =
    adjustmentMode === 'adaptive' && includeCheckin
      ? await adaptiveTdeeService
          .calculateAdaptiveTdee(targetUserId, date)
          .catch((error: unknown) => {
            log(
              'warn',
              `Adaptive TDEE fetch failed for user ${targetUserId}:`,
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
    userProfile,
    userPreferences,
    measurements,
    adaptiveTdeeData
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
