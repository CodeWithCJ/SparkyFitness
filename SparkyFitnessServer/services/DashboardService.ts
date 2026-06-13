import goalRepository from '../models/goalRepository.js';
import reportRepository from '../models/reportRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import bmrService from './bmrService.js';
import adaptiveTdeeService from './AdaptiveTdeeService.js';
import { log } from '../config/logging.js';
import {
  CALORIE_CALCULATION_CONSTANTS,
  userHourMinute,
  computeCalorieTarget,
} from '@workspace/shared';
import { userAge } from '../utils/dateHelpers.js';
/**
 * Aggregates stats for external dashboards (like gethomepage.dev).
 * matches logic in DailyProgress.tsx
 */
async function getDashboardStats(userId: string, date: string) {
  try {
    const [
      goals,
      nutritionData,
      exerciseEntries,
      userProfile,
      userPreferences,
      latestMeasurements,
      checkInMeasurements,
      adaptiveTdeeData,
    ] = await Promise.all([
      goalRepository.getMostRecentGoalBeforeDate(userId, date),
      reportRepository.getNutritionData(userId, date, date, []),
      // @ts-expect-error TS(2554): Expected 6 arguments, but got 3.
      reportRepository.getExerciseEntries(userId, date, date),
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      measurementRepository.getLatestMeasurement(userId),
      measurementRepository.getCheckInMeasurementsByDate(userId, date),
      adaptiveTdeeService.calculateAdaptiveTdee(userId),
    ]);
    // 1. Goal Calories (Base)
    const rawGoalCalories = parseFloat(goals?.calories) || 2000;
    // 2. Eaten Calories
    const eatenCalories =
      nutritionData.length > 0 ? parseFloat(nutritionData[0].calories) || 0 : 0;
    // 3. Exercise Calories
    let activeCalories = 0;
    let otherCalories = 0;
    let activitySteps = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exerciseEntries.forEach((entry: any) => {
      if (entry.exercise_name === 'Active Calories') {
        activeCalories += parseFloat(entry.calories_burned || 0);
      } else {
        otherCalories += parseFloat(entry.calories_burned || 0);
      }
      activitySteps += parseInt(entry.steps || 0);
    });
    // 4. Steps Calories
    const stepsCount = parseInt(checkInMeasurements?.steps || 0);
    const backgroundSteps = Math.max(0, stepsCount - activitySteps);
    const weightKg =
      parseFloat(latestMeasurements?.weight) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG;
    const heightCm =
      parseFloat(latestMeasurements?.height) ||
      CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM;
    // Distance-based step calorie calculation (Net calories above BMR)
    // Formula matches frontend: steps * stride_length * weight * 0.4
    const strideLengthM =
      (heightCm * CALORIE_CALCULATION_CONSTANTS.STRIDE_LENGTH_MULTIPLIER) / 100;
    const distanceKm = (backgroundSteps * strideLengthM) / 1000;
    const backgroundStepCalories = Math.round(
      distanceKm *
        weightKg *
        CALORIE_CALCULATION_CONSTANTS.NET_CALORIES_PER_KG_PER_KM
    );
    // 5. BMR & Activity Baselines
    let bmr = 0;
    const includeInNet = userPreferences?.include_bmr_in_net_calories || false;
    const activityLevel = userPreferences?.activity_level || 'not_much';
    const multiplier =
      (bmrService.ActivityMultiplier as Record<string, number>)[
        activityLevel
      ] || 1.2;
    if (userProfile && userPreferences) {
      const tz = userPreferences?.timezone || 'UTC';
      const age = userAge(userProfile.date_of_birth, tz) ?? 30;
      const gender = userProfile.gender || 'male';
      const bmrAlgorithm = userPreferences.bmr_algorithm || 'Mifflin-St Jeor';
      const bodyFat = latestMeasurements?.body_fat_percentage;
      try {
        bmr = bmrService.calculateBmr(
          bmrAlgorithm,
          weightKg,
          parseFloat(latestMeasurements?.height) || 170,
          age,
          gender,
          bodyFat
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log('warn', `DashboardService: BMR calc failed: ${errMsg}`);
      }
    }
    const sparkyfitnessBurned = Math.round(bmr * multiplier);
    const calorieGoalOffset =
      bmr > 0 ? rawGoalCalories - sparkyfitnessBurned : 0;
    // 3-tier fallback to avoid double-counting
    // We compare:
    // 1. Device total "Active Calories" (which includes steps + workouts)
    // 2. Individual workouts + background steps
    // We take whichever is larger.
    const workoutPlusSteps = otherCalories + backgroundStepCalories;
    const exerciseCalories =
      activeCalories >= workoutPlusSteps ? activeCalories : workoutPlusSteps;
    const bmrToAdd = includeInNet ? bmr : 0;
    const totalBurned = exerciseCalories + bmrToAdd;
    const netCalories = eatenCalories - totalBurned;
    // 6. Goal Adjustment Logic
    let remaining = 0;
    let finalGoalCalories = rawGoalCalories;
    const adjustmentMode =
      userPreferences?.calorie_goal_adjustment_mode || 'dynamic';
    const exerciseCaloriePercentage =
      userPreferences?.exercise_calorie_percentage ?? 100;
    const allowNegativeAdjustment =
      userPreferences?.tdee_allow_negative_adjustment ?? false;
    // Apply Adaptive TDEE baseline if mode is active and BMR is available
    if (adjustmentMode === 'adaptive' && adaptiveTdeeData && bmr > 0) {
      finalGoalCalories = Math.round(adaptiveTdeeData.tdee + calorieGoalOffset);
    }

    // Apply Goal Mode Deficit targets if enabled
    const goalMode = userPreferences?.goal_mode || 'maintain';
    const goalModeCalculationMethod =
      userPreferences?.goal_mode_calculation_method || 'manual';
    const goalModeCustomPercentage =
      userPreferences?.goal_mode_custom_percentage ?? 0;

    if (goalMode !== 'maintain' && bmr > 0) {
      const tz = userPreferences?.timezone || 'UTC';
      const age = userAge(userProfile.date_of_birth, tz) ?? 30;
      const gender = (userProfile.gender || 'male') as 'male' | 'female';
      const bodyFat = latestMeasurements?.body_fat_percentage;
      const bmrAlgorithm = userPreferences?.bmr_algorithm || 'Mifflin-St Jeor';

      const result = computeCalorieTarget({
        goalMode,
        calculationMethod: goalModeCalculationMethod,
        customPercentage: goalModeCustomPercentage,
        bmr,
        activityLevelMultiplier: multiplier,
        adaptiveTdee: adaptiveTdeeData
          ? (adaptiveTdeeData.tdee as number)
          : null,
        adaptiveTdeeFallback: adaptiveTdeeData
          ? (adaptiveTdeeData.isFallback as boolean)
          : true,
        adaptiveTdeeDaysOfData: adaptiveTdeeData
          ? (adaptiveTdeeData.daysOfData as number) || 0
          : 0,
        weightKg,
        heightCm,
        age,
        gender,
        bodyFatPercentage: bodyFat,
        bmrAlgorithm,
        currentGoalCalories: finalGoalCalories,
        calculateBmrFn: bmrService.calculateBmr,
      });

      finalGoalCalories = result.finalTarget;
    }
    if (adjustmentMode === 'dynamic') {
      // 100% of all burned calories credited
      remaining = finalGoalCalories - netCalories;
    } else if (adjustmentMode === 'percentage') {
      // Only a percentage of exercise calories are credited
      const adjustedExerciseBurned =
        exerciseCalories * (exerciseCaloriePercentage / 100);
      const adjustedTotalBurned = adjustedExerciseBurned + bmrToAdd;
      remaining = finalGoalCalories - (eatenCalories - adjustedTotalBurned);
    } else if (adjustmentMode === 'tdee' || adjustmentMode === 'smart') {
      // Device Projection (TDEE adjustment)
      // For dashboard, we assume current time is "now" for projection
      const tz = userPreferences?.timezone || 'UTC';
      const { hour, minute } = userHourMinute(tz);
      const minutesSinceMidnight = hour * 60 + minute;
      const dayFraction = minutesSinceMidnight / (24 * 60);
      const projectedDeviceCalories =
        dayFraction >= 0.05 && exerciseCalories > 0
          ? Math.round(exerciseCalories / dayFraction)
          : exerciseCalories;
      const projectedBurn = bmr + projectedDeviceCalories;
      let tdeeAdjustment = projectedBurn - sparkyfitnessBurned;
      if (!allowNegativeAdjustment) {
        tdeeAdjustment = Math.max(0, tdeeAdjustment);
      }
      remaining = finalGoalCalories - eatenCalories + tdeeAdjustment;
    } else if (adjustmentMode === 'adaptive') {
      remaining = finalGoalCalories - eatenCalories;
    } else {
      // fixed: no exercise calories credited
      remaining = finalGoalCalories - eatenCalories;
    }
    // effectiveConsumed = goalCalories - remaining (how much of the goal is "used up")
    const effectiveConsumed = finalGoalCalories - remaining;
    const progress =
      finalGoalCalories > 0
        ? Math.min((effectiveConsumed / finalGoalCalories) * 100, 100)
        : 0;
    return {
      eaten: Math.round(eatenCalories),
      burned: Math.round(totalBurned),
      remaining: Math.round(remaining),
      goal: Math.round(finalGoalCalories),
      net: Math.round(netCalories),
      progress: Math.round(progress),
      steps: stepsCount,
      stepCalories: backgroundStepCalories,
      bmr: Math.round(bmr),
      unit: 'kcal',
    };
  } catch (error) {
    log(
      'error',
      `Error calculating Dashboard stats for user ${userId}:`,
      error
    );
    throw error;
  }
}
export { getDashboardStats };
export default {
  getDashboardStats,
};
