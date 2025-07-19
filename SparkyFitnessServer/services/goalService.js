const goalRepository = require('../models/goalRepository');
const weeklyGoalPlanRepository = require('../models/weeklyGoalPlanRepository');
const goalPresetRepository = require('../models/goalPresetRepository');
const { log } = require('../config/logging');
const { format, getDay } = require('date-fns');

// Helper function to calculate grams from percentages
function calculateGramsFromPercentages(calories, protein_percentage, carbs_percentage, fat_percentage) {
  const protein_grams = calories * (protein_percentage / 100) / 4;
  const carbs_grams = calories * (carbs_percentage / 100) / 4;
  const fat_grams = calories * (fat_percentage / 100) / 9;
  return { protein_grams, carbs_grams, fat_grams };
}

async function getUserGoals(targetUserId, selectedDate) {
  try {
    if (!targetUserId) {
      log('error', 'getUserGoals: targetUserId is undefined. Returning default goals.');
      return {
        calories: 2000, protein: 150, carbs: 250, fat: 67, water_goal: 8,
        saturated_fat: 20, polyunsaturated_fat: 10, monounsaturated_fat: 25, trans_fat: 0,
        cholesterol: 300, sodium: 2300, potassium: 3500, dietary_fiber: 25, sugars: 50,
        vitamin_a: 900, vitamin_c: 90, calcium: 1000, iron: 18,
        target_exercise_calories_burned: 0, target_exercise_duration_minutes: 0,
        protein_percentage: null, carbs_percentage: null, fat_percentage: null,
        breakfast_percentage: 25, lunch_percentage: 25, dinner_percentage: 25, snacks_percentage: 25
      };
    }

    let goals = await goalRepository.getGoalByDate(targetUserId, selectedDate);

    if (!goals) {
      // Check active weekly plan
      const activeWeeklyPlan = await weeklyGoalPlanRepository.getActiveWeeklyGoalPlan(targetUserId, selectedDate);
      if (activeWeeklyPlan) {
        const dayOfWeek = getDay(new Date(selectedDate)); // Sunday is 0, Monday is 1, etc.
        let presetId;
        switch (dayOfWeek) {
          case 0: presetId = activeWeeklyPlan.sunday_preset_id; break;
          case 1: presetId = activeWeeklyPlan.monday_preset_id; break;
          case 2: presetId = activeWeeklyPlan.tuesday_preset_id; break;
          case 3: presetId = activeWeeklyPlan.wednesday_preset_id; break;
          case 4: presetId = activeWeeklyPlan.thursday_preset_id; break;
          case 5: presetId = activeWeeklyPlan.friday_preset_id; break;
          case 6: presetId = activeWeeklyPlan.saturday_preset_id; break;
        }

        if (presetId) {
          goals = await goalPresetRepository.getGoalPresetById(presetId, targetUserId);
        }
      }
    }

    if (!goals) {
      // Fallback to most recent goal before date (which includes default goal if goal_date is NULL)
      goals = await goalRepository.getMostRecentGoalBeforeDate(targetUserId, selectedDate);
    }

    // If still no goals, return hardcoded defaults
    if (!goals) {
      goals = {
        calories: 2000, protein: 150, carbs: 250, fat: 67, water_goal: 8,
        saturated_fat: 20, polyunsaturated_fat: 10, monounsaturated_fat: 25, trans_fat: 0,
        cholesterol: 300, sodium: 2300, potassium: 3500, dietary_fiber: 25, sugars: 50,
        vitamin_a: 900, vitamin_c: 90, calcium: 1000, iron: 18,
        target_exercise_calories_burned: 0, target_exercise_duration_minutes: 0,
        protein_percentage: null, carbs_percentage: null, fat_percentage: null,
        breakfast_percentage: 25, lunch_percentage: 25, dinner_percentage: 25, snacks_percentage: 25
      };
    }

    // If percentages are set, calculate absolute grams for return
    if (goals.protein_percentage !== null && goals.carbs_percentage !== null && goals.fat_percentage !== null) {
      const { protein_grams, carbs_grams, fat_grams } = calculateGramsFromPercentages(
        goals.calories,
        goals.protein_percentage,
        goals.carbs_percentage,
        goals.fat_percentage
      );
      goals.protein = protein_grams;
      goals.carbs = carbs_grams;
      goals.fat = fat_grams;
    }

    return goals;
  } catch (error) {
    log('error', `Error fetching goals for user ${targetUserId} on ${selectedDate}:`, error);
    throw error;
  }
}

async function manageGoalTimeline(authenticatedUserId, goalData) {
  try {
    const {
      p_start_date, p_calories, p_protein, p_carbs, p_fat, p_water_goal,
      p_saturated_fat, p_polyunsaturated_fat, p_monounsaturated_fat, p_trans_fat,
      p_cholesterol, p_sodium, p_potassium, p_dietary_fiber, p_sugars,
      p_vitamin_a, p_vitamin_c, p_calcium, p_iron,
      p_target_exercise_calories_burned, p_target_exercise_duration_minutes,
      p_protein_percentage, p_carbs_percentage, p_fat_percentage,
      p_breakfast_percentage, p_lunch_percentage, p_dinner_percentage, p_snacks_percentage
    } = goalData;

    log('debug', `manageGoalTimeline - Received goalData: ${JSON.stringify(goalData)}`);

    // If percentages are provided, calculate grams for storage
    let protein_to_store = p_protein;
    let carbs_to_store = p_carbs;
    let fat_to_store = p_fat;

    if (typeof p_protein_percentage === 'number' && !isNaN(p_protein_percentage) &&
        typeof p_carbs_percentage === 'number' && !isNaN(p_carbs_percentage) &&
        typeof p_fat_percentage === 'number' && !isNaN(p_fat_percentage)) {
      const { protein_grams, carbs_grams, fat_grams } = calculateGramsFromPercentages(
        p_calories,
        p_protein_percentage,
        p_carbs_percentage,
        p_fat_percentage
      );
      protein_to_store = protein_grams;
      carbs_to_store = carbs_grams;
      fat_to_store = fat_grams;
      log('debug', `manageGoalTimeline - Calculated grams from percentages: Protein ${protein_to_store}, Carbs ${carbs_to_store}, Fat ${fat_to_store}`);
    } else {
      log('debug', `manageGoalTimeline - Using provided grams: Protein ${protein_to_store}, Carbs ${protein_to_store}, Fat ${fat_to_store}. Percentages were not all valid numbers.`);
    }

    // Helper to convert NaN to 0 for numeric fields, or null if specified
    const cleanNumber = (value, allow_null = false) => {
      if (value === null || value === undefined) {
        return allow_null ? null : 0;
      }
      return isNaN(value) ? (allow_null ? null : 0) : value;
    };

    // If editing a past date (before today), only update that specific date
    if (new Date(p_start_date) < new Date(format(new Date(), 'yyyy-MM-dd'))) {
      log('debug', `manageGoalTimeline - Updating goal for past date: ${p_start_date}`);
      await goalRepository.upsertGoal({
        user_id: authenticatedUserId, goal_date: p_start_date,
        calories: cleanNumber(p_calories),
        protein: cleanNumber(protein_to_store),
        carbs: cleanNumber(carbs_to_store),
        fat: cleanNumber(fat_to_store),
        water_goal: cleanNumber(p_water_goal),
        saturated_fat: cleanNumber(p_saturated_fat),
        polyunsaturated_fat: cleanNumber(p_polyunsaturated_fat),
        monounsaturated_fat: cleanNumber(p_monounsaturated_fat),
        trans_fat: cleanNumber(p_trans_fat),
        cholesterol: cleanNumber(p_cholesterol),
        sodium: cleanNumber(p_sodium),
        potassium: cleanNumber(p_potassium),
        dietary_fiber: cleanNumber(p_dietary_fiber),
        sugars: cleanNumber(p_sugars),
        vitamin_a: cleanNumber(p_vitamin_a),
        vitamin_c: cleanNumber(p_vitamin_c),
        calcium: cleanNumber(p_calcium),
        iron: cleanNumber(p_iron),
        target_exercise_calories_burned: cleanNumber(p_target_exercise_calories_burned),
        target_exercise_duration_minutes: cleanNumber(p_target_exercise_duration_minutes),
        protein_percentage: cleanNumber(p_protein_percentage, true),
        carbs_percentage: cleanNumber(p_carbs_percentage, true),
        fat_percentage: cleanNumber(p_fat_percentage, true),
        breakfast_percentage: cleanNumber(p_breakfast_percentage, true),
        lunch_percentage: cleanNumber(p_lunch_percentage, true),
        dinner_percentage: cleanNumber(p_dinner_percentage, true),
        snacks_percentage: cleanNumber(p_snacks_percentage, true)
      });
      return { message: 'Goal for past date updated successfully.' };
    }

    // For today or future dates: delete 6 months and insert new goals
    log('info', `manageGoalTimeline - Updating goal for today or future date: ${p_start_date}. Applying 6-month cascade.`);
    const startDate = new Date(p_start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 6);

    await goalRepository.deleteGoalsInRange(authenticatedUserId, p_start_date, format(endDate, 'yyyy-MM-dd'));

    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      await goalRepository.upsertGoal({
        user_id: authenticatedUserId, goal_date: format(currentDate, 'yyyy-MM-dd'),
        calories: cleanNumber(p_calories),
        protein: cleanNumber(protein_to_store),
        carbs: cleanNumber(carbs_to_store),
        fat: cleanNumber(fat_to_store),
        water_goal: cleanNumber(p_water_goal),
        saturated_fat: cleanNumber(p_saturated_fat),
        polyunsaturated_fat: cleanNumber(p_polyunsaturated_fat),
        monounsaturated_fat: cleanNumber(p_monounsaturated_fat),
        trans_fat: cleanNumber(p_trans_fat),
        cholesterol: cleanNumber(p_cholesterol),
        sodium: cleanNumber(p_sodium),
        potassium: cleanNumber(p_potassium),
        dietary_fiber: cleanNumber(p_dietary_fiber),
        sugars: cleanNumber(p_sugars),
        vitamin_a: cleanNumber(p_vitamin_a),
        vitamin_c: cleanNumber(p_vitamin_c),
        calcium: cleanNumber(p_calcium),
        iron: cleanNumber(p_iron),
        target_exercise_calories_burned: cleanNumber(p_target_exercise_calories_burned),
        target_exercise_duration_minutes: cleanNumber(p_target_exercise_duration_minutes),
        protein_percentage: cleanNumber(p_protein_percentage, true),
        carbs_percentage: cleanNumber(p_carbs_percentage, true),
        fat_percentage: cleanNumber(p_fat_percentage, true),
        breakfast_percentage: cleanNumber(p_breakfast_percentage, true),
        lunch_percentage: cleanNumber(p_lunch_percentage, true),
        dinner_percentage: cleanNumber(p_dinner_percentage, true),
        snacks_percentage: cleanNumber(p_snacks_percentage, true)
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await goalRepository.deleteDefaultGoal(authenticatedUserId);

    return { message: 'Goal timeline managed successfully.' };
  } catch (error) {
    log('error', `Error managing goal timeline for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

module.exports = {
  getUserGoals,
  manageGoalTimeline,
};