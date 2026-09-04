import {
  calculateCaloriesConsumed,
  calculateProtein,
  calculateCarbs,
  calculateFat,
  calculateFiber,
  calculateCustomNutrientTotals,
} from './api/foodEntriesApi';
import { fetchDailySummary } from './api/dailySummaryApi';
import { resolveCollapsedFoodEntries } from '../utils/loggedMealCollapse';
import { calculateExerciseStats } from '../utils/workoutSession';
import type { DailySummary } from '../types/dailySummary';
import type { DailyGoals } from '../types/goals';
import type { FoodEntry } from '../types/foodEntries';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
  SupplementTotals,
} from '@workspace/shared';
import {
  resolveSupplementTotals,
  addSupplementCustomNutrients,
} from '@workspace/shared';
import type { WaterIntake } from '../types/measurements';

export interface DailySummaryRawData {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseSessionResponse[];
  waterIntake: WaterIntake;
  stepCalories: number;
  calorieBalance?: CalorieBalance;
  supplementTotals?: SupplementTotals;
  adjustedGoals?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
}

export async function loadDailySummaryRawData(
  date: string
): Promise<DailySummaryRawData> {
  const data = await fetchDailySummary(date);
  const foodEntries = await resolveCollapsedFoodEntries(date, data.foodEntries);

  return {
    goals: data.goals,
    foodEntries,
    exerciseEntries: data.exerciseSessions,
    waterIntake: { water_ml: data.waterIntake },
    stepCalories: data.stepCalories ?? 0,
    calorieBalance: data.calorieBalance,
    supplementTotals: data.supplementTotals,
    adjustedGoals: data.adjustedGoals ?? null,
  };
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
    stepCalories,
    calorieBalance,
    supplementTotals,
    adjustedGoals,
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
  const resolvedCalorieBalance: CalorieBalance = calorieBalance ?? {
    eaten: Math.round(caloriesConsumed),
    burned: Math.round(caloriesBurned),
    remaining: Math.round(fallbackRemaining),
    goal: Math.round(calorieGoal),
    net: Math.round(netCalories),
    progress:
      calorieGoal > 0
        ? Math.max(0, Math.round((caloriesConsumed / calorieGoal) * 100))
        : 0,
    bmr: 0,
    bmrSource: 'formula' as const,
    exerciseSource: 'none',
    tdeeProjection: null,
  };

  return {
    date,
    calorieGoal,
    caloriesConsumed,
    caloriesBurned,
    activeCalories,
    otherExerciseCalories,
    stepCalories,
    exerciseMinutes,
    exerciseMinutesGoal: goals.target_exercise_duration_minutes || 0,
    exerciseCaloriesGoal: goals.target_exercise_calories_burned || 0,
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
    waterGoal: goals.water_goal_ml ?? 2500,
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
