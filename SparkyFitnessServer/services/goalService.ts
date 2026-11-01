import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import bmrService from './bmrService.js';
import goalPresetService from './goalPresetService.js';
import adaptiveTdeeService from './AdaptiveTdeeService.js';
import { loadPreferencesByDay } from './calorieRuleHistoryService.js';
import type { AdaptiveTdeeResult } from './AdaptiveTdeeService.js';
import { ageOnDay } from '../utils/dateHelpers.js';
import { log } from '../config/logging.js';
import { addDays, format, getDay, isAfter, parseISO } from 'date-fns';
import { localDateToDay, weeklyGoalPlanInForce } from '@workspace/shared';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  todayInZone,
  CALORIE_CALCULATION_CONSTANTS,
  computeCalorieTarget,
  isAdaptiveTdeeMature,
  resolveCalorieSafetyFloor,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  ACTIVITY_MULTIPLIERS,
  isUsableMeasuredBmr,
  isAdaptiveActivitySeparated,
} from '@workspace/shared';
import customNutrientService from './customNutrientService.js';
import { DEFAULT_GOALS } from '../constants/goals.js';
import { Goals } from '../types/goals.js';
import { getAdaptiveActivityCalories } from './adaptiveActivityService.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import {
  computeExerciseMacroCredit,
  resolveDeviceProjectionSnapshot,
  type DeviceProjectionTotal,
} from './calorieBalanceService.js';
import { dbContextStorage } from '../db/poolManager.js';
import { canAccessUserData } from '../utils/permissionUtils.js';

interface GoalActivityAccess {
  actorUserId?: string;
  includeCheckin?: boolean;
}

interface GoalMeasurement {
  entry_date: string | Date;
  steps?: string | number | null;
  weight?: string | number | null;
  height?: string | number | null;
  [field: string]: unknown;
}
// Helper function to calculate grams from percentages
function calculateGramsFromPercentages(
  calories: unknown,
  protein_percentage: unknown,
  carbs_percentage: unknown,
  fat_percentage: unknown,
  dietary_fiber?: unknown
) {
  const fiber = Number(dietary_fiber) || 0;
  const adjustedCalories = Math.max(0, (Number(calories) || 0) - fiber * 2);
  const protein_grams =
    (adjustedCalories * (Number(protein_percentage) / 100)) / 4;
  const carbs_grams = (adjustedCalories * (Number(carbs_percentage) / 100)) / 4;
  const fat_grams = (adjustedCalories * (Number(fat_percentage) / 100)) / 9;
  return { protein_grams, carbs_grams, fat_grams };
}

async function getUserGoalsForRange(
  userId: string,
  startDate: string,
  endDate: string,
  adjust = false,
  activityAccess: GoalActivityAccess = {}
) {
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
  const weeklyPlans =
    await weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange(
      userId,
      startDate,
      endDate
    );
  const presetCache: Record<string, unknown> = {};
  const getPreset = async (presetId: string) => {
    if (!presetCache[presetId]) {
      // Go through the service so the preset's `water_goal` column is mapped to
      // the `water_goal_ml` field every other goal source uses.
      presetCache[presetId] = await goalPresetService.getGoalPreset(
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
  ] as const;

  let currentFallback = (fallback ?? DEFAULT_GOALS) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);

  let userProfile = null;
  let userPreferences = null;
  let allMeasurements: GoalMeasurement[] = [];

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
      (a, b) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );
  }

  const preferencesOn = adjust
    ? await loadPreferencesByDay(userId, userPreferences, startDate, endDate)
    : () => null;

  let waterEstimatedMap: Record<string, number> = {};
  let adaptiveTdeeMap: Record<string, AdaptiveTdeeResult> = {};
  let activityCaloriesByDate = new Map<string, number>();
  let deviceTotalsByDate = new Map<string, DeviceProjectionTotal>();
  const actorUserId =
    activityAccess.actorUserId ??
    dbContextStorage.getStore()?.authenticatedUserId ??
    userId;
  let includeMacroCheckin = false;
  if (adjust && userPreferences) {
    let anyAdaptiveDay = false;
    let anyDeviceProjectionDay = false;
    for (
      let day = parseISO(startDate);
      !isAfter(day, end);
      day = addDays(day, 1)
    ) {
      const dayPreferences = preferencesOn(format(day, 'yyyy-MM-dd'));
      const adjustmentMode = dayPreferences?.calorie_goal_adjustment_mode;
      anyAdaptiveDay ||=
        adjustmentMode === 'adaptive' ||
        dayPreferences?.goal_mode_calculation_method === 'adaptive';
      anyDeviceProjectionDay ||=
        adjustmentMode === 'tdee' || adjustmentMode === 'smart';
    }
    if (userPreferences.adjust_macros_with_exercise) {
      includeMacroCheckin =
        activityAccess.includeCheckin ??
        (await canAccessUserData(userId, 'checkin_read', actorUserId));
      activityCaloriesByDate = await getAdaptiveActivityCalories(
        userId,
        startDate,
        endDate,
        allMeasurements,
        includeMacroCheckin
      );
      if (includeMacroCheckin && anyDeviceProjectionDay) {
        const totals =
          await genericHealthRepository.getDeviceTotalCaloriesByDateRange(
            userId,
            actorUserId,
            startDate,
            endDate
          );
        deviceTotalsByDate = new Map(
          totals.map((row) => [
            row.entry_date,
            { totalCalories: row.total_calories, capturedAt: row.captured_at },
          ])
        );
      }
    }
    if (anyAdaptiveDay) {
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
    if (userPreferences.add_exercise_water_to_goal) {
      waterEstimatedMap =
        await exerciseEntryRepository.getWaterEstimatedSumForDateRange(
          userId,
          startDate,
          endDate
        );
    }
  }

  const getMeasurementFieldForDate = (dateStr: string, field: string) => {
    const found = allMeasurements.find((m) => {
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

  // Same lookup, without carry-forward. Used for measured BMR, which is only valid
  // on the day it was recorded — carrying it forward would keep a stale reading
  // driving the goal long after syncing stopped (issue #2395).
  const getMeasurementFieldOnDate = (dateStr: string, field: string) => {
    const found = allMeasurements.find((m) => {
      const mDateStr =
        m.entry_date instanceof Date
          ? localDateToDay(m.entry_date)
          : String(m.entry_date).slice(0, 10);
      return (
        mDateStr === dateStr &&
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
    } else {
      const weeklyPlan = weeklyGoalPlanInForce(weeklyPlans, dateStr);
      const presetId = weeklyPlan?.[DAY_PRESETS[getDay(cursor)]];
      if (presetId) {
        goals = await getPreset(presetId);
      }
    }

    if (!goals) {
      goals = currentFallback;
    }

    // Clone to avoid mutating the source in the cache or repository
    let processedGoals = { ...goals };
    // A preset may omit the water goal; keep the one already in effect before
    // falling back to the default.
    if (
      processedGoals.water_goal_ml === null ||
      processedGoals.water_goal_ml === undefined
    ) {
      processedGoals.water_goal_ml =
        currentFallback.water_goal_ml ?? DEFAULT_GOALS.water_goal_ml;
    }

    if (adjust) {
      const dayPreferences = preferencesOn(dateStr);
      let goalCalories =
        parseFloat(String(processedGoals.calories ?? '')) || 2000;
      const adjustmentMode =
        dayPreferences?.calorie_goal_adjustment_mode || 'dynamic';
      const goalMode = dayPreferences?.goal_mode || 'maintain';
      const goalModeCalculationMethod =
        dayPreferences?.goal_mode_calculation_method || 'manual';
      const goalModeCustomPercentage =
        dayPreferences?.goal_mode_custom_percentage ?? 0;
      const activityLevel = dayPreferences?.activity_level || 'not_much';
      const bmrAlgorithm = dayPreferences?.bmr_algorithm || 'Mifflin-St Jeor';
      const gender = (userProfile?.gender || 'male') as 'male' | 'female';

      const weightKg =
        getMeasurementFieldForDate(dateStr, 'weight') ||
        CALORIE_CALCULATION_CONSTANTS.DEFAULT_WEIGHT_KG;
      const heightCm =
        getMeasurementFieldForDate(dateStr, 'height') ||
        CALORIE_CALCULATION_CONSTANTS.DEFAULT_HEIGHT_CM;
      const bodyFat =
        getMeasurementFieldForDate(dateStr, 'body_fat_percentage') || undefined;
      // Exact date, not carry-forward: a measured BMR only counts on its own day.
      const measuredBmr = getMeasurementFieldOnDate(dateStr, 'bmr');

      let formulaBmr = 0;
      if (userProfile && dayPreferences) {
        const age = ageOnDay(userProfile.date_of_birth, dateStr) ?? 30;
        try {
          formulaBmr = bmrService.calculateBmr(
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
      // The measured value is checked against the formula estimate when one could
      // be computed, and on the absolute bounds alone when it could not — a failed
      // or impossible formula must not discard an otherwise good reading.
      const bmr =
        dayPreferences?.use_external_bmr &&
        isUsableMeasuredBmr(measuredBmr, formulaBmr || null)
          ? (measuredBmr as number)
          : formulaBmr;

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
        activityAdjustedTdee?: number;
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

      // Apply adaptive TDEE base adjustment.
      if (adjustmentMode === 'adaptive' && adaptiveTdeeData && bmr > 0) {
        // Hold the estimated baseline until the measured estimate is settled, the
        // same test computeCalorieTarget applies below. Without it this path
        // budgeted against a raw 7-day estimate that the settings preview was
        // still rejecting, so the goal and the preview disagreed.
        const adaptiveBaseline = isAdaptiveTdeeMature(
          adaptiveTdeeData.tdee,
          adaptiveTdeeData.isFallback,
          adaptiveTdeeData.daysOfData
        )
          ? adaptiveTdeeData.tdee
          : Math.round(bmr * activityMultiplier);
        const adaptiveGoal = Math.round(adaptiveBaseline + calorieGoalOffset);
        const adaptiveGoalFloor = resolveCalorieSafetyFloor(
          dayPreferences?.calorie_safety_floor_mode,
          dayPreferences?.calorie_safety_floor_value,
          DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR
        );
        goalCalories =
          adaptiveGoalFloor === null
            ? adaptiveGoal
            : Math.max(adaptiveGoalFloor, adaptiveGoal);
      }

      // Apply goal mode deficit AND baseline replacement.
      // Must always run when bmr > 0 — even for 'maintain' — so that
      // calculationMethod='adaptive' replaces the stored goal with the
      // adaptive TDEE baseline (matches CalculationSettings preview).
      // A weekly offset on a saved manual baseline does not need a BMR estimate.
      // Keep the existing prerequisite for adaptive full-day budgeting.
      const hasWeeklyManualBaseline =
        goalMode === 'weekly' &&
        goalModeCalculationMethod === 'manual' &&
        goalCalories > 0;
      if (bmr > 0 || hasWeeklyManualBaseline) {
        const age = userProfile
          ? (ageOnDay(userProfile.date_of_birth, dateStr) ?? 30)
          : 30;
        const targetResult = computeCalorieTarget({
          goalMode,
          calculationMethod: goalModeCalculationMethod,
          customPercentage: goalModeCustomPercentage,
          weeklyChangeKg: dayPreferences?.goal_mode_weekly_change_kg ?? 0,
          bmr,
          activityLevelMultiplier: activityMultiplier,
          adaptiveTdee: adaptiveTdeeData
            ? isAdaptiveActivitySeparated(
                adjustmentMode,
                goalModeCalculationMethod,
                dayPreferences?.adaptive_activity_separate
              )
              ? (adaptiveTdeeData.activityAdjustedTdee ?? adaptiveTdeeData.tdee)
              : adaptiveTdeeData.tdee
            : null,
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
          calorieSafetyFloorMode:
            dayPreferences?.calorie_safety_floor_mode || 'standard',
          calorieSafetyFloorValue:
            dayPreferences?.calorie_safety_floor_value ||
            DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
          // computeCalorieTarget re-validates this against its own formula estimate
          // before letting it become the RMR safety floor.
          measuredBmr:
            dayPreferences?.use_external_bmr &&
            isUsableMeasuredBmr(measuredBmr, formulaBmr || null)
              ? measuredBmr
              : undefined,
        });
        goalCalories = targetResult.finalTarget;
      }

      processedGoals.calories = goalCalories;
    }

    if (
      [
        processedGoals.protein_percentage,
        processedGoals.carbs_percentage,
        processedGoals.fat_percentage,
      ].every(
        (value) =>
          value !== null &&
          value !== undefined &&
          Number.isFinite(Number(value))
      )
    ) {
      let macroCalories = Number(processedGoals.calories);
      if (adjust && userPreferences?.adjust_macros_with_exercise) {
        const dayPreferences = preferencesOn(dateStr);
        // Use the same budget policy as the diary, including adaptive suppression
        // and Device Projection. Resting BMR is not exercise earn-back.
        const credit = computeExerciseMacroCredit({
          date: dateStr,
          eatenCalories: 0,
          adjustedGoalCalories: macroCalories,
          exercise: {
            activeCalories: 0,
            otherCalories: activityCaloriesByDate.get(dateStr) ?? 0,
            activitySteps: 0,
          },
          backgroundStepCalories: 0,
          userProfile,
          userPreferences: {
            ...dayPreferences,
            include_bmr_in_net_calories: false,
          },
          measurements: includeMacroCheckin
            ? {
                weight: getMeasurementFieldForDate(dateStr, 'weight'),
                height: getMeasurementFieldForDate(dateStr, 'height'),
                body_fat_percentage: getMeasurementFieldForDate(
                  dateStr,
                  'body_fat_percentage'
                ),
                bmr: getMeasurementFieldOnDate(dateStr, 'bmr'),
              }
            : null,
          ...resolveDeviceProjectionSnapshot({
            date: dateStr,
            timezone: userPreferences.timezone || 'UTC',
            deviceTotal: deviceTotalsByDate.get(dateStr),
          }),
        });
        macroCalories += credit;
      }
      const { protein_grams, carbs_grams, fat_grams } =
        calculateGramsFromPercentages(
          macroCalories,
          processedGoals.protein_percentage,
          processedGoals.carbs_percentage,
          processedGoals.fat_percentage,
          processedGoals.dietary_fiber
        );
      processedGoals = {
        ...processedGoals,
        protein: protein_grams,
        carbs: carbs_grams,
        fat: fat_grams,
      };
    }

    // Adjust water goal by exercise water loss if preference is enabled
    if (adjust && userPreferences?.add_exercise_water_to_goal) {
      const waterLoss = waterEstimatedMap[dateStr] || 0;
      if (waterLoss > 0) {
        const baseWaterGoal =
          processedGoals.water_goal_ml ?? DEFAULT_GOALS.water_goal_ml ?? 1920;
        processedGoals = {
          ...processedGoals,
          water_goal_ml: Number(baseWaterGoal) + waterLoss,
        };
      }
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
  adjust = false,
  activityAccess: GoalActivityAccess = {}
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
      return getUserGoalsForRange(
        targetUserId,
        selectedDate,
        endDate,
        adjust,
        activityAccess
      );
    }
    const rangeGoals = await getUserGoalsForRange(
      targetUserId,
      selectedDate,
      selectedDate,
      adjust,
      activityAccess
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
      p_caffeine_mg,
      p_alcohol_g,
      p_target_exercise_calories_burned,
      p_target_exercise_duration_minutes,
      p_target_steps,
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
          p_fat_percentage,
          p_dietary_fiber
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blankToNull = (value: any) =>
      typeof value === 'string' && value.trim() === '' ? null : value;
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
      // A blank input means "no water goal", not 0.
      water_goal_ml: cleanNumber(
        typeof p_water_goal_ml === 'string' && p_water_goal_ml.trim() === ''
          ? null
          : p_water_goal_ml,
        true
      ),
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
      // Like water: a missing or blank caffeine/alcohol goal means "no limit set",
      // not a limit of 0 (both are tracked as maximums).
      caffeine_mg: cleanNumber(blankToNull(p_caffeine_mg), true),
      alcohol_g: cleanNumber(blankToNull(p_alcohol_g), true),
      target_exercise_calories_burned: cleanNumber(
        p_target_exercise_calories_burned
      ),
      target_exercise_duration_minutes: cleanNumber(
        p_target_exercise_duration_minutes
      ),
      // Blank means "no steps goal", not 0; omitted (older client) leaves the
      // stored goal alone.
      target_steps:
        p_target_steps === undefined
          ? undefined
          : cleanNumber(blankToNull(p_target_steps), true),
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
