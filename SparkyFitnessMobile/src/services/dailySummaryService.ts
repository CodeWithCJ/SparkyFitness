import {
  calculateCaloriesConsumed,
  calculateProtein,
  calculateCarbs,
  calculateFat,
  calculateFiber,
  calculateCustomNutrientTotals,
} from './api/foodEntriesApi';
import { fetchDailySummary } from './api/dailySummaryApi';
import {
  readWaitingForDay,
  type WaitingForDay,
} from '../offline/dailySummaryOverlay';
import { resolveCollapsedFoodEntries } from '../utils/loggedMealCollapse';
import { calculateExerciseStats } from '../utils/workoutSession';
import type { DailySummary } from '../types/dailySummary';
import type { DailyGoals } from '../types/goals';
import type { FoodEntry } from '../types/foodEntries';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
  SupplementTotals,
  WaterIntakeBreakdown,
  AdjustedGoals,
  CalorieCyclingDay,
} from '@workspace/shared';
import {
  resolveSupplementTotals,
  addSupplementCustomNutrients,
  computeCalorieProgress,
} from '@workspace/shared';
import type { WaterIntake } from '../types/measurements';

export interface DailySummaryRawData {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseSessionResponse[];
  waterIntake: WaterIntake;
  waterIntakeBreakdown?: WaterIntakeBreakdown | null;
  stepCalories: number;
  calorieBalance?: CalorieBalance;
  supplementTotals?: SupplementTotals;
  adjustedGoals?: AdjustedGoals | null;
  /** How calorie cycling set the day's goal; absent from older servers. */
  calorieCycling?: CalorieCyclingDay;
}

/**
 * Adds what is waiting to upload to a day's numbers. The server's summary, or
 * the phone's copy of it, does not include those entries yet: they are listed
 * with the day's food, counted in the calories, macros and the calorie
 * balance, and added to the water total. Once uploaded they are in the
 * server's numbers and no longer waiting, so nothing is counted twice.
 */
export function applyWaitingToRawData(
  raw: DailySummaryRawData,
  waiting: WaitingForDay
): DailySummaryRawData {
  const { deletedFoodEntryIds } = waiting;
  if (
    waiting.foodEntries.length === 0 &&
    waiting.waterMl === 0 &&
    deletedFoodEntryIds.length === 0
  ) {
    return raw;
  }
  // An entry the server has whose removal waits to upload is already out of
  // the day's list and its calories are back, as they will be once it is gone.
  const gone = new Set(deletedFoodEntryIds);
  const removed = raw.foodEntries.filter((entry) => gone.has(entry.id));
  const kept = raw.foodEntries.filter((entry) => !gone.has(entry.id));
  const addedCalories =
    calculateCaloriesConsumed(waiting.foodEntries) -
    calculateCaloriesConsumed(removed);
  const { calorieBalance, waterIntakeBreakdown } = raw;
  return {
    ...raw,
    foodEntries: [...kept, ...waiting.foodEntries],
    calorieBalance: calorieBalance && {
      ...calorieBalance,
      eaten: calorieBalance.eaten + addedCalories,
      net: calorieBalance.net + addedCalories,
      remaining: calorieBalance.remaining - addedCalories,
    },
    waterIntake: {
      ...raw.waterIntake,
      water_ml: (raw.waterIntake.water_ml || 0) + waiting.waterMl,
    },
    waterIntakeBreakdown: waterIntakeBreakdown && {
      ...waterIntakeBreakdown,
      manual_ml:
        (Number(waterIntakeBreakdown.manual_ml) || 0) + waiting.waterMl,
    },
  };
}

export async function loadDailySummaryRawData(
  date: string
): Promise<DailySummaryRawData> {
  const data = await fetchDailySummary(date);
  // Collapsing logged meals asks the server for their totals. With the server
  // away the day still shows, with a logged meal as its component entries.
  const foodEntries = await resolveCollapsedFoodEntries(
    date,
    data.foodEntries
  ).catch(() => data.foodEntries);

  const raw: DailySummaryRawData = {
    goals: data.goals,
    foodEntries,
    exerciseEntries: data.exerciseSessions,
    waterIntake: { water_ml: data.waterIntake },
    waterIntakeBreakdown: data.waterIntakeBreakdown ?? null,
    stepCalories: data.stepCalories ?? 0,
    calorieBalance: data.calorieBalance,
    supplementTotals: data.supplementTotals,
    adjustedGoals: data.adjustedGoals ?? null,
    calorieCycling: data.calorieCycling,
  };
  return applyWaitingToRawData(raw, await readWaitingForDay(date));
}

export function buildDailySummary(
  date: string,
  raw: DailySummaryRawData
): DailySummary {
  const {
    goals,
    foodEntries,
    exerciseEntries,
    waterIntake,
    waterIntakeBreakdown,
    stepCalories,
    calorieBalance,
    supplementTotals,
    adjustedGoals,
    calorieCycling,
  } = raw;

  const calorieGoal = adjustedGoals?.calories ?? goals.calories ?? 0;
  const supplements = resolveSupplementTotals(supplementTotals);
  const caloriesConsumed =
    calculateCaloriesConsumed(foodEntries) + supplements.calories;
  const exerciseStats = calculateExerciseStats(exerciseEntries);
  const { caloriesBurned, activeCalories, otherExerciseCalories } =
    exerciseStats;
  const exerciseMinutes = exerciseStats.durationMinutes;
  const netCalories = caloriesConsumed - caloriesBurned;
  const remainingCalories = calorieGoal - netCalories;

  const fallbackRemaining = calorieGoal - caloriesConsumed;
  const balance: CalorieBalance = calorieBalance ?? {
    eaten: Math.round(caloriesConsumed),
    burned: Math.round(caloriesBurned),
    remaining: Math.round(fallbackRemaining),
    goal: Math.round(calorieGoal),
    net: Math.round(netCalories),
    progress: 0,
    bmr: 0,
    bmrSource: 'formula' as const,
    exerciseSource: 'none',
    tdeeProjection: null,
  };
  // Older servers report net calories / base goal here. Derive the food-budget
  // percentage from their authoritative totals so every mobile surface agrees.
  const resolvedCalorieBalance: CalorieBalance = {
    ...balance,
    progress: Math.round(
      computeCalorieProgress(balance.eaten, balance.remaining)
    ),
  };

  return {
    date,
    calorieGoal,
    calorieCycling,
    caloriesConsumed,
    caloriesBurned,
    activeCalories,
    otherExerciseCalories,
    stepCalories,
    exerciseMinutes,
    exerciseMinutesGoal: goals.target_exercise_duration_minutes || 0,
    exerciseCaloriesGoal: goals.target_exercise_calories_burned || 0,
    stepsGoal: goals.target_steps || 0,
    netCalories,
    remainingCalories,
    protein: {
      consumed: calculateProtein(foodEntries) + supplements.protein,
      goal: adjustedGoals?.protein ?? goals.protein ?? 0,
    },
    carbs: {
      consumed: calculateCarbs(foodEntries) + supplements.carbs,
      goal: adjustedGoals?.carbs ?? goals.carbs ?? 0,
    },
    fat: {
      consumed: calculateFat(foodEntries) + supplements.fat,
      goal: adjustedGoals?.fat ?? goals.fat ?? 0,
    },
    fiber: {
      consumed: calculateFiber(foodEntries) + supplements.dietary_fiber,
      goal: goals.dietary_fiber || 0,
    },
    waterConsumed: waterIntake.water_ml || 0,
    waterGoal: adjustedGoals?.water_goal_ml ?? goals.water_goal_ml ?? 2500,
    waterFromFood: Number(waterIntakeBreakdown?.food_ml) || 0,
    waterManual: waterIntakeBreakdown
      ? Number(waterIntakeBreakdown.manual_ml) || 0
      : null,
    foodEntries,
    supplementTotals: supplements,
    exerciseEntries,
    calorieBalance: resolvedCalorieBalance,
    goals,
    customNutrientTotals: addSupplementCustomNutrients(
      calculateCustomNutrientTotals(foodEntries),
      supplements
    ),
    customNutrientGoals: goals.custom_nutrients
      ? Object.fromEntries(
          Object.entries(goals.custom_nutrients).map(([name, value]) => [
            name,
            typeof value === 'number' ? value : parseFloat(String(value)) || 0,
          ])
        )
      : {},
  };
}
