const goalRepository = require('../models/goalRepository');
const reportRepository = require('../models/reportRepository');
const measurementRepository = require('../models/measurementRepository');
const userRepository = require('../models/userRepository');
const preferenceRepository = require('../models/preferenceRepository');
const bmrService = require('./bmrService');
const adaptiveTdeeService = require('./AdaptiveTdeeService');
const { log } = require('../config/logging');
const { CALORIE_CALCULATION_CONSTANTS } = require('@workspace/shared');

/**
 * Aggregates stats for external dashboards (like gethomepage.dev).
 * matches logic in DailyProgress.tsx
 */
async function getDashboardStats(userId, date) {
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
    // Deduplicate workout entries across sources before summing: if two entries from
    // different sources start within 10 minutes of each other and have similar durations
    // (within 20%), they represent the same session. Keep the entry with more calories.
    let activeCalories = 0;
    let otherCalories = 0;
    let activitySteps = 0;
    const deduplicatedWorkouts = [];
    for (const entry of exerciseEntries) {
      if (entry.exercise_name === 'Active Calories') {
        activeCalories += parseFloat(entry.calories_burned || 0);
        activitySteps += parseInt(entry.steps || 0);
        continue;
      }
      const entryStart = entry.start_time
        ? new Date(entry.start_time).getTime()
        : null;
      const entryDuration = parseFloat(entry.duration_minutes || 0);
      const isDuplicate =
        entryStart &&
        entryDuration > 0 &&
        deduplicatedWorkouts.some((existing) => {
          const existingStart = existing.start_time
            ? new Date(existing.start_time).getTime()
            : null;
          const existingDuration = parseFloat(existing.duration_minutes || 0);
          if (!existingStart) return false;
          const startDiffSec = Math.abs(entryStart - existingStart) / 1000;
          const durationMin = Math.min(entryDuration, existingDuration);
          const durationMax = Math.max(entryDuration, existingDuration);
          return startDiffSec <= 600 && durationMin >= durationMax * 0.8;
        });
      if (!isDuplicate) {
        deduplicatedWorkouts.push(entry);
      } else {
        log(
          'info',
          `DashboardService: skipping cross-source duplicate workout entry ${entry.id} (${entry.source})`
        );
      }
      activitySteps += parseInt(entry.steps || 0);
    }
    deduplicatedWorkouts.forEach((entry) => {
      otherCalories += parseFloat(entry.calories_burned || 0);
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
    const multiplier = bmrService.ActivityMultiplier[activityLevel] || 1.2;

    if (userProfile && userPreferences) {
      const dob = userProfile.date_of_birth;
      let age = 30;
      if (dob) {
        const today = new Date();
        const birthDate = new Date(dob);
        age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }
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
        log('warn', `DashboardService: BMR calc failed: ${error.message}`);
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
      const now = new Date();
      const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
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

module.exports = {
  getDashboardStats,
};
