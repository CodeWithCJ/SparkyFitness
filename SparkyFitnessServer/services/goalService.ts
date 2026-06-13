import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import goalPresetRepository from '../models/goalPresetRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from './bmrService.js';
import adaptiveTdeeService from './AdaptiveTdeeService.js';
import { userAge } from '../utils/dateHelpers.js';
import { log } from '../config/logging.js';
import { addDays, format, getDay, isAfter, parseISO } from 'date-fns';
import { localDateToDay } from '@workspace/shared';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  todayInZone,
  CALORIE_CALCULATION_CONSTANTS,
  computeCalorieTarget,
  ACTIVITY_MULTIPLIERS,
} from '@workspace/shared';
import customNutrientService from './customNutrientService.js';
import { DEFAULT_GOALS } from '../constants/goals.js';
import { Goals } from '../types/goals.js';
// Helper function to calculate grams from percentages
function calculateGramsFromPercentages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calories: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protein_percentage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  carbs_percentage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fat_percentage: any
) {
  const protein_grams = (calories * (protein_percentage / 100)) / 4;
  const carbs_grams = (calories * (carbs_percentage / 100)) / 4;
  const fat_grams = (calories * (fat_percentage / 100)) / 9;
  return { protein_grams, carbs_grams, fat_grams };
}

async function getUserGoalsForRange(
  userId: string,
  startDate: string,
  endDate: string,
  adjust = false
) {
  console.log('getUserGoalsForRange called with adjust=', adjust);
  const explicitGoals = await goalRepository.getGoalsInRange(
    userId,
    startDate,
    endDate
  );
  const explicitByDate = Object.fromEntries(
    explicitGoals.map((g: Goals) => [
      // goal_date arrives from pg as a 'YYYY-MM-DD' string; use it directly so the key
      // is not shifted by new Date()/format() on a non-UTC server.
      typeof g.goal_date === 'string'
        ? g.goal_date.slice(0, 10)
        : format(g.goal_date, 'yyyy-MM-dd'),
      g,
    ])
  );
  const activeWeeklyPlan =
    await weeklyGoalPlanRepository.getActiveWeeklyGoalPlan(userId, startDate);
  const presetCache: Record<string, unknown> = {};
  const getPreset = async (presetId: string) => {
    if (!presetCache[presetId]) {
      presetCache[presetId] = await goalPresetRepository.getGoalPresetById(
        presetId,
        userId
      );
    }
    return presetCache[presetId];
  };

  const fallback = await goalRepository.getMostRecentGoalBeforeDate(
    userId,
    startDate
  );

  const DAY_PRESETS = [
    'sunday_preset_id',
    'monday_preset_id',
    'tuesday_preset_id',
    'wednesday_preset_id',
    'thursday_preset_id',
    'friday_preset_id',
    'saturday_preset_id',
  ];

  let currentFallback = (fallback ?? DEFAULT_GOALS) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);

  let userProfile = null;
  let userPreferences = null;
  let allMeasurements = [];

  if (adjust) {
    [userProfile, userPreferences] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
    ]);
    const [initialMeasurement, rangeMeasurements] = await Promise.all([
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        userId,
        startDate
      ),
      measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        startDate,
        endDate
      ),
    ]);
    allMeasurements = [
      ...(initialMeasurement ? [initialMeasurement] : []),
      ...(rangeMeasurements || []),
    ].sort(
      (a: any, b: any) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );
  }

  let adaptiveTdeeMap: Record<string, any> = {};
  if (adjust && userPreferences) {
    const adjustmentMode =
      userPreferences.calorie_goal_adjustment_mode || 'dynamic';
    const goalModeCalculationMethod =
      userPreferences.goal_mode_calculation_method || 'manual';
    if (
      adjustmentMode === 'adaptive' ||
      goalModeCalculationMethod === 'adaptive'
    ) {
      try {
        adaptiveTdeeMap = await adaptiveTdeeService.calculateAdaptiveTdeeRange(
          userId,
          startDate,
          endDate
        );
      } catch (err) {
        log(
          'warn',
          `goalService: Failed to bulk fetch adaptive TDEE range for ${userId} [${startDate}, ${endDate}]: ${(err as Error).message}`
        );
      }
    }
  }

  const getMeasurementFieldForDate = (dateStr: string, field: string) => {
    const found = allMeasurements.find((m: any) => {
      const mDateStr =
        m.entry_date instanceof Date
          ? localDateToDay(m.entry_date)
          : String(m.entry_date).slice(0, 10);
      return (
        mDateStr <= dateStr &&
        m[field] !== null &&
        m[field] !== undefined &&
        m[field] !== ''
      );
    });
    return found ? parseFloat(String(found[field])) : null;
  };

  while (!isAfter(cursor, end)) {
    const dateStr = format(cursor, 'yyyy-MM-dd');
    let goals = explicitByDate[dateStr] ?? null;

    if (goals) {
      currentFallback = goals;
    } else if (activeWeeklyPlan) {
      const presetId = activeWeeklyPlan[DAY_PRESETS[getDay(cursor)]];
      if (presetId) {
        goals = await getPreset(presetId);
      }
    }

    if (!goals) {
      goals = currentFallback;
    }

    // Clone to avoid mutating the source in the cache or repository
    let processedGoals = { ...goals };

    if (adjust) {
      let goalCalories =
        parseFloat(String(processedGoals.calories ?? '')) || 2000;
      const adjustmentMode =
        userPreferences?.calorie_goal_adjustment_mode || 'dynamic';
      const goalMode = userPreferences?.goal_mode || 'maintain';
      const goalModeCalculationMethod =
        userPreferences?.goal_mode_calculation_method || 'manual';
      const goalModeCustomPercentage =
        userPreferences?.goal_mode_custom_percentage ?? 0;
      const activityLevel = userPreferences?.activity_level || 'not_much';
      const bmrAlgorithm = userPreferences?.bmr_algorithm || 'Mifflin-St Jeor';

      const weightKg =
        getMeasurementFieldForDate(dateStr, 'weight') ||
        CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG;
      const heightCm =
        getMeasurementFieldForDate(dateStr, 'height') ||
        CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM;
      const bodyFat =
        getMeasurementFieldForDate(dateStr, 'body_fat_percentage') || undefined;

      let bmr = 0;
      if (userProfile && userPreferences) {
        const tz = userPreferences.timezone || 'UTC';
        const age = userAge(userProfile.date_of_birth ?? '', tz) ?? 30;
        const gender = userProfile.gender || 'male';
        try {
          bmr = bmrService.calculateBmr(
            bmrAlgorithm,
            weightKg,
            heightCm,
            age,
            gender,
            bodyFat
          );
        } catch (err) {
          log(
            'warn',
            `goalService: BMR calc failed for ${userId} on ${dateStr}: ${(err as Error).message}`
          );
        }
      }

      // Mirror DashboardService exactly: use user's actual activity multiplier, not hardcoded
      const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] || 1.2;
      const staticTdee = Math.round(bmr * activityMultiplier);
      // Offset = how far the stored goal sits above/below the static TDEE estimate
      const calorieGoalOffset = bmr > 0 ? goalCalories - staticTdee : 0;

      // Always fetch adaptive TDEE when either:
      //   - calorie_goal_adjustment_mode is 'adaptive' (base goal shifts with adaptive TDEE)
      //   - goalModeCalculationMethod is 'adaptive' (deficit applied on top of adaptive TDEE)
      let adaptiveTdeeData: {
        tdee: number;
        isFallback: boolean;
        daysOfData: number;
      } | null = null;
      if (
        adjustmentMode === 'adaptive' ||
        goalModeCalculationMethod === 'adaptive'
      ) {
        adaptiveTdeeData = adaptiveTdeeMap[dateStr] || null;
        if (!adaptiveTdeeData) {
          try {
            adaptiveTdeeData = (await adaptiveTdeeService.calculateAdaptiveTdee(
              userId,
              dateStr
            )) as { tdee: number; isFallback: boolean; daysOfData: number };
          } catch (err) {
            log(
              'warn',
              `goalService: Adaptive TDEE fetch failed for ${userId} on ${dateStr}: ${(err as Error).message}`
            );
          }
        }
      }

      // Apply adaptive TDEE base adjustment — mirrors DashboardService
      if (adjustmentMode === 'adaptive' && adaptiveTdeeData && bmr > 0) {
        goalCalories = Math.max(
          1200,
          Math.round(adaptiveTdeeData.tdee + calorieGoalOffset)
        );
      }

      // Apply goal mode deficit AND baseline replacement.
      // Must always run when bmr > 0 — even for 'maintain' — so that
      // calculationMethod='adaptive' replaces the stored goal with the
      // adaptive TDEE baseline (matches CalculationSettings preview).
      if (bmr > 0) {
        const tz = userPreferences?.timezone || 'UTC';
        const age = userProfile
          ? (userAge(userProfile.date_of_birth ?? '', tz) ?? 30)
          : 30;
        const gender = (userProfile?.gender || 'male') as 'male' | 'female';

        const targetResult = computeCalorieTarget({
          goalMode,
          calculationMethod: goalModeCalculationMethod,
          customPercentage: goalModeCustomPercentage,
          bmr,
          activityLevelMultiplier: activityMultiplier,
          adaptiveTdee: adaptiveTdeeData ? adaptiveTdeeData.tdee : null,
          adaptiveTdeeFallback: adaptiveTdeeData
            ? (adaptiveTdeeData.isFallback ?? true)
            : true,
          adaptiveTdeeDaysOfData: adaptiveTdeeData
            ? (adaptiveTdeeData.daysOfData ?? 0)
            : 0,
          weightKg,
          heightCm,
          age,
          gender,
          bodyFatPercentage: bodyFat,
          bmrAlgorithm,
          currentGoalCalories: goalCalories,
          calculateBmrFn: bmrService.calculateBmr,
        });
        goalCalories = targetResult.finalTarget;
      }

      processedGoals.calories = goalCalories;
    }

    if (
      processedGoals.protein_percentage !== null &&
      processedGoals.carbs_percentage !== null &&
      processedGoals.fat_percentage !== null
    ) {
      const { protein_grams, carbs_grams, fat_grams } =
        calculateGramsFromPercentages(
          processedGoals.calories,
          processedGoals.protein_percentage,
          processedGoals.carbs_percentage,
          processedGoals.fat_percentage
        );
      processedGoals = {
        ...processedGoals,
        protein: protein_grams,
        carbs: carbs_grams,
        fat: fat_grams,
      };
    }

    result[dateStr] = processedGoals;
    cursor = addDays(cursor, 1);
  }

  return result;
}

async function getUserGoals(
  targetUserId: string,
  selectedDate: string,
  endDate?: string,
  adjust = false
) {
  try {
    if (!targetUserId) {
      log(
        'error',
        'getUserGoals: targetUserId is undefined. Returning default goals.'
      );
      return DEFAULT_GOALS;
    }
    if (endDate) {
      return getUserGoalsForRange(targetUserId, selectedDate, endDate, adjust);
    }
    const rangeGoals = await getUserGoalsForRange(
      targetUserId,
      selectedDate,
      selectedDate,
      adjust
    );
    return rangeGoals[selectedDate] || DEFAULT_GOALS;
  } catch (error) {
    log(
      'error',
      `Error fetching goals for user ${targetUserId} on ${selectedDate}:`,
      error
    );
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function manageGoalTimeline(authenticatedUserId: string, goalData: any) {
  try {
    const {
      p_start_date,
      p_cascade,
      p_calories,
      p_protein,
      p_carbs,
      p_fat,
      p_water_goal_ml,
      p_saturated_fat,
      p_polyunsaturated_fat,
      p_monounsaturated_fat,
      p_trans_fat,
      p_cholesterol,
      p_sodium,
      p_potassium,
      p_dietary_fiber,
      p_sugars,
      p_vitamin_a,
      p_vitamin_c,
      p_calcium,
      p_iron,
      p_target_exercise_calories_burned,
      p_target_exercise_duration_minutes,
      p_protein_percentage,
      p_carbs_percentage,
      p_fat_percentage,
      p_breakfast_percentage,
      p_lunch_percentage,
      p_dinner_percentage,
      p_snacks_percentage,
      custom_meal_percentages,
      custom_nutrients,
    } = goalData;
    log(
      'debug',
      `manageGoalTimeline - Received goalData: ${JSON.stringify(goalData)}`
    );
    log('debug', `manageGoalTimeline - p_water_goal_ml: ${p_water_goal_ml}`);
    // If percentages are provided, calculate grams for storage
    let protein_to_store = p_protein;
    let carbs_to_store = p_carbs;
    let fat_to_store = p_fat;
    if (
      typeof p_protein_percentage === 'number' &&
      !isNaN(p_protein_percentage) &&
      typeof p_carbs_percentage === 'number' &&
      !isNaN(p_carbs_percentage) &&
      typeof p_fat_percentage === 'number' &&
      !isNaN(p_fat_percentage)
    ) {
      const { protein_grams, carbs_grams, fat_grams } =
        calculateGramsFromPercentages(
          p_calories,
          p_protein_percentage,
          p_carbs_percentage,
          p_fat_percentage
        );
      protein_to_store = protein_grams;
      carbs_to_store = carbs_grams;
      fat_to_store = fat_grams;
      log(
        'debug',
        `manageGoalTimeline - Calculated grams from percentages: Protein ${protein_to_store}, Carbs ${carbs_to_store}, Fat ${fat_to_store}`
      );
    } else {
      log(
        'debug',
        `manageGoalTimeline - Using provided grams: Protein ${protein_to_store}, Carbs ${protein_to_store}, Fat ${fat_to_store}. Percentages were not all valid numbers.`
      );
    }
    // Helper to convert NaN to 0 for numeric fields, or null if specified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanNumber = (value: any, allow_null = false) => {
      log(
        'debug',
        `cleanNumber: Input value: ${value}, type: ${typeof value}, allow_null: ${allow_null}`
      );
      if (value === null || value === undefined) {
        log(
          'debug',
          `cleanNumber: Value is null/undefined, returning ${allow_null ? null : 0}`
        );
        return allow_null ? null : 0;
      }
      const num = Number(value);
      if (isNaN(num)) {
        log(
          'debug',
          `cleanNumber: Value is NaN, returning ${allow_null ? null : 0}`
        );
        return allow_null ? null : 0;
      }
      log('debug', `cleanNumber: Returning cleaned number: ${num}`);
      return num;
    };
    const activeCustomNutrients =
      await customNutrientService.getCustomNutrients(authenticatedUserId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeNames = new Set(activeCustomNutrients.map((n: any) => n.name));
    const filteredCustomNutrients = {};
    if (custom_nutrients && typeof custom_nutrients === 'object') {
      Object.entries(custom_nutrients).forEach(([name, value]) => {
        if (activeNames.has(name)) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          filteredCustomNutrients[name] = value;
        } else {
          log(
            'debug',
            `manageGoalTimeline: Filtering out inactive custom nutrient: ${name}`
          );
        }
      });
    }
    const goalPayload = {
      user_id: authenticatedUserId,
      goal_date: p_start_date,
      calories: cleanNumber(p_calories),
      protein: cleanNumber(protein_to_store),
      carbs: cleanNumber(carbs_to_store),
      fat: cleanNumber(fat_to_store),
      water_goal_ml: cleanNumber(p_water_goal_ml),
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
      target_exercise_calories_burned: cleanNumber(
        p_target_exercise_calories_burned
      ),
      target_exercise_duration_minutes: cleanNumber(
        p_target_exercise_duration_minutes
      ),
      protein_percentage: cleanNumber(p_protein_percentage, true),
      carbs_percentage: cleanNumber(p_carbs_percentage, true),
      fat_percentage: cleanNumber(p_fat_percentage, true),
      breakfast_percentage: cleanNumber(p_breakfast_percentage, true),
      lunch_percentage: cleanNumber(p_lunch_percentage, true),
      dinner_percentage: cleanNumber(p_dinner_percentage, true),
      snacks_percentage: cleanNumber(p_snacks_percentage, true),
      custom_meal_percentages: custom_meal_percentages || {},
      custom_nutrients: filteredCustomNutrients,
    };
    // If cascade is false, or if editing a past date, only update that specific date
    if (
      !p_cascade ||
      p_start_date < todayInZone(await loadUserTimezone(authenticatedUserId))
    ) {
      log(
        'debug',
        `manageGoalTimeline - Upserting single goal for date: ${p_start_date}. Final payload before upsert: ${JSON.stringify(goalPayload)}`
      );
      await goalRepository.upsertGoal(goalPayload);
      return { message: 'Goal for the specified date updated successfully.' };
    } else {
      // For today or future dates with cascade: delete 6 months and insert new goals
      log(
        'info',
        `manageGoalTimeline - Updating goal for today or future date: ${p_start_date}. Applying 6-month cascade. Final payload before upsert: ${JSON.stringify(goalPayload)}`
      );
      const startDate = new Date(p_start_date);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 6);
      // Delete existing goals in the range to prevent conflicts and ensure clean slate
      await goalRepository.deleteGoalsInRange(
        authenticatedUserId,
        p_start_date,
        format(endDate, 'yyyy-MM-dd')
      );
      // Insert the new goal, which will act as the template for the cascade
      await goalRepository.upsertGoal(goalPayload);
      // The getMostRecentGoalBeforeDate function will now handle the cascading logic,
      // so we don't need to loop and insert for every single day.
      // We also remove the default goal to ensure this new goal becomes the baseline.
      await goalRepository.deleteDefaultGoal(authenticatedUserId);
      return { message: 'Goal timeline managed successfully with cascade.' };
    }
  } catch (error) {
    log(
      'error',
      `Error managing goal timeline for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
export { getUserGoals };
export { getUserGoalsForRange };
export { manageGoalTimeline };
export default {
  getUserGoals,
  getUserGoalsForRange,
  manageGoalTimeline,
};
