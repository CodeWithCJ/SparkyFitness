const goalRepository = require("../models/goalRepository");
const reportRepository = require("../models/reportRepository");
const measurementRepository = require("../models/measurementRepository");
const userRepository = require("../models/userRepository");
const preferenceRepository = require("../models/preferenceRepository");
const bmrService = require("./bmrService");
const { log } = require("../config/logging");

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
    ] = await Promise.all([
      goalRepository.getMostRecentGoalBeforeDate(userId, date),
      reportRepository.getNutritionData(userId, date, date, []),
      reportRepository.getExerciseEntries(userId, date, date),
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      measurementRepository.getLatestMeasurement(userId),
      measurementRepository.getCheckInMeasurementsByDate(userId, date),
    ]);

    // 1. Goal Calories
    const goalCalories = parseFloat(goals?.calories) || 2000;

    // 2. Eaten Calories
    const eatenCalories =
      nutritionData.length > 0 ? parseFloat(nutritionData[0].calories) || 0 : 0;

    // 3. Exercise Calories
    let activeCalories = 0;
    let otherCalories = 0;
    exerciseEntries.forEach((entry) => {
      if (entry.exercise_name === "Active Calories") {
        activeCalories += parseFloat(entry.calories_burned || 0);
      } else {
        otherCalories += parseFloat(entry.calories_burned || 0);
      }
    });

    // 4. Steps Calories
    const stepsCount = parseInt(checkInMeasurements?.steps || 0);

    let weightKg = parseFloat(latestMeasurements?.weight) || 70;
    const stepsCalories = Math.round(stepsCount * 0.04 * (weightKg / 70));

    // 5. BMR
    let bmr = 0;
    const includeInNet = userPreferences?.include_bmr_in_net_calories || false;

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
      const gender = userProfile.gender || "male";
      const bmrAlgorithm = userPreferences.bmr_algorithm || "Mifflin-St Jeor";
      const bodyFat = latestMeasurements?.body_fat_percentage;

      try {
        bmr = bmrService.calculateBmr(
          bmrAlgorithm,
          weightKg,
          parseFloat(latestMeasurements?.height) || 170,
          age,
          gender,
          bodyFat,
        );
      } catch (error) {
        log("warn", `DashboardService: BMR calc failed: ${error.message}`);
      }
    }

    const activeOrStepsToAdd =
      activeCalories > 0 ? activeCalories : stepsCalories;
    const exerciseCalories = otherCalories + activeOrStepsToAdd;
    const bmrToAdd = includeInNet ? bmr : 0;
    const totalBurned = exerciseCalories + bmrToAdd;

    const netCalories = eatenCalories - totalBurned;

    let remaining = 0;
    const adjustmentMode =
      userPreferences?.calorie_goal_adjustment_mode || "dynamic";
    const exerciseCaloriePercentage =
      userPreferences?.exercise_calorie_percentage ?? 100;

    if (adjustmentMode === "dynamic") {
      // 100% of all burned calories credited
      remaining = goalCalories - netCalories;
    } else if (adjustmentMode === "percentage") {
      // Only a percentage of exercise calories are credited (BMR unchanged)
      const adjustedExerciseBurned = exerciseCalories * (exerciseCaloriePercentage / 100);
      const adjustedTotalBurned = adjustedExerciseBurned + bmrToAdd;
      remaining = goalCalories - (eatenCalories - adjustedTotalBurned);
    } else if (adjustmentMode === "smart") {
      // MFP-style: only earn back exercise calories above what's already built into the daily goal.
      // The activity portion already assumed in the goal = goal - BMR.
      // (If BMR is 0/unavailable, this falls back to no exercise credit, like fixed mode.)
      const activityAlreadyInGoal = Math.max(0, goalCalories - bmr);
      const exerciseAdjustment = Math.max(0, exerciseCalories - activityAlreadyInGoal);
      remaining = goalCalories - eatenCalories + exerciseAdjustment;
    } else {
      // fixed: no exercise calories credited
      remaining = goalCalories - eatenCalories;
    }

    // effectiveConsumed = goalCalories - remaining (how much of the goal is "used up")
    const effectiveConsumed = goalCalories - remaining;
    const progress =
      goalCalories > 0
        ? Math.min((effectiveConsumed / goalCalories) * 100, 100)
        : 0;

    return {
      eaten: Math.round(eatenCalories),
      burned: Math.round(totalBurned),
      remaining: Math.round(remaining),
      goal: Math.round(goalCalories),
      net: Math.round(netCalories),
      progress: Math.round(progress),
      steps: stepsCount,
      bmr: Math.round(bmr),
      unit: "kcal",
    };
  } catch (error) {
    log(
      "error",
      `Error calculating Dashboard stats for user ${userId}:`,
      error,
    );
    throw error;
  }
}

module.exports = {
  getDashboardStats,
};
