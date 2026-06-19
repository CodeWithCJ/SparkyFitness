import { useQuery } from '@tanstack/react-query';
import {
  calculateCaloriesConsumed,
  calculateProtein,
  calculateCarbs,
  calculateFat,
  calculateFiber,
} from '../services/api/foodEntriesApi';
import { calculateExerciseStats } from '../utils/workoutSession';
import { fetchDailySummary } from '../services/api/dailySummaryApi';
import { fetchFoodEntryMealsByDate } from '../services/api/foodEntryMealsApi';
import type { DailySummary } from '../types/dailySummary';
import type { DailyGoals } from '../types/goals';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodEntryMeal } from '../types/foodEntryMeals';
import type { ExerciseSessionResponse, CalorieBalance } from '@workspace/shared';
import type { WaterIntake } from '../types/measurements';

import { useRefetchOnFocus } from './useRefetchOnFocus';
import { dailySummaryQueryKey } from './queryKeys';

export interface DailySummaryRawData {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseSessionResponse[];
  waterIntake: WaterIntake;
  stepCalories: number;
  calorieBalance?: CalorieBalance;
}

interface UseDailySummaryOptions {
  date: string;
  enabled?: boolean;
}

function hasLoggedMealComponents(foodEntries: FoodEntry[]): boolean {
  return foodEntries.some((entry) => !!entry.food_entry_meal_id);
}

function loggedMealToFoodEntry(meal: FoodEntryMeal): FoodEntry {
  const quantity = Number(meal.quantity) > 0 ? Number(meal.quantity) : 1;

  return {
    id: meal.id,
    user_id: meal.user_id,
    meal_id: meal.meal_template_id ?? undefined,
    food_entry_meal_id: meal.id,
    meal_type: meal.meal_type,
    meal_type_id: meal.meal_type_id ?? undefined,
    quantity,
    unit: meal.unit,
    entry_date: meal.entry_date,
    food_name: meal.name,
    serving_size: quantity,
    serving_unit: meal.unit,
    calories: meal.calories ?? 0,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    saturated_fat: meal.saturated_fat,
    polyunsaturated_fat: meal.polyunsaturated_fat,
    monounsaturated_fat: meal.monounsaturated_fat,
    trans_fat: meal.trans_fat,
    cholesterol: meal.cholesterol,
    sodium: meal.sodium,
    potassium: meal.potassium,
    dietary_fiber: meal.dietary_fiber,
    sugars: meal.sugars,
    vitamin_a: meal.vitamin_a,
    vitamin_c: meal.vitamin_c,
    calcium: meal.calcium,
    iron: meal.iron,
    glycemic_index: meal.glycemic_index,
    custom_nutrients: meal.custom_nutrients,
  };
}

function collapseLoggedMealComponents(
  foodEntries: FoodEntry[],
  loggedMeals: FoodEntryMeal[],
): FoodEntry[] {
  if (loggedMeals.length === 0) {
    return foodEntries;
  }

  const mealById = new Map(loggedMeals.map((meal) => [meal.id, meal]));
  const addedMealIds = new Set<string>();
  const collapsedEntries: FoodEntry[] = [];

  for (const entry of foodEntries) {
    const loggedMealId = entry.food_entry_meal_id;
    if (!loggedMealId) {
      collapsedEntries.push(entry);
      continue;
    }

    const loggedMeal = mealById.get(loggedMealId);
    if (!loggedMeal) {
      collapsedEntries.push(entry);
      continue;
    }

    if (!addedMealIds.has(loggedMealId)) {
      collapsedEntries.push(loggedMealToFoodEntry(loggedMeal));
      addedMealIds.add(loggedMealId);
    }
  }

  for (const meal of loggedMeals) {
    if (!addedMealIds.has(meal.id)) {
      collapsedEntries.push(loggedMealToFoodEntry(meal));
    }
  }

  return collapsedEntries;
}

export function useDailySummary({ date, enabled = true }: UseDailySummaryOptions) {
  const query = useQuery({
    queryKey: dailySummaryQueryKey(date),
    queryFn: async () => {
      const data = await fetchDailySummary(date);
      let foodEntries = data.foodEntries;

      if (hasLoggedMealComponents(data.foodEntries)) {
        try {
          const loggedMeals = await fetchFoodEntryMealsByDate(date);
          foodEntries = collapseLoggedMealComponents(data.foodEntries, loggedMeals);
        } catch {
          foodEntries = data.foodEntries;
        }
      }

      return {
        goals: data.goals,
        foodEntries,
        exerciseEntries: data.exerciseSessions,
        waterIntake: { water_ml: data.waterIntake },
        stepCalories: data.stepCalories ?? 0,
        calorieBalance: data.calorieBalance,
        adjustedGoals: data.adjustedGoals ?? null,
      };
    },
    select: (raw): DailySummary => {
      const { goals, foodEntries, exerciseEntries, waterIntake, stepCalories, calorieBalance, adjustedGoals } = raw;

      const calorieGoal = adjustedGoals?.calories ?? goals.calories ?? 0;
      const caloriesConsumed = calculateCaloriesConsumed(foodEntries);
      const exerciseStats = calculateExerciseStats(exerciseEntries);
      const { caloriesBurned, activeCalories, otherExerciseCalories } = exerciseStats;
      const exerciseMinutes = exerciseStats.durationMinutes;
      const netCalories = caloriesConsumed - caloriesBurned;
      const remainingCalories = calorieGoal - netCalories;

      // If calorieBalance is not provided by the API (old server version), we calculate it here to
      // ensure the UI has consistent data to work with. Uses fixed-mode logic (goal - eaten) to
      // match the server default, with rounding and clamping to match computeCalorieBalance output.
      const fallbackRemaining = calorieGoal - caloriesConsumed;
      const resolvedCalorieBalance: CalorieBalance = calorieBalance ?? {
        eaten: Math.round(caloriesConsumed),
        burned: Math.round(caloriesBurned),
        remaining: Math.round(fallbackRemaining),
        goal: Math.round(calorieGoal),
        net: Math.round(netCalories),
        progress: calorieGoal > 0 ? Math.max(0, Math.round((caloriesConsumed / calorieGoal) * 100)) : 0,
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
          consumed: calculateProtein(foodEntries),
          goal: adjustedGoals?.protein ?? goals.protein ?? 0,
        },
        carbs: {
          consumed: calculateCarbs(foodEntries),
          goal: adjustedGoals?.carbs ?? goals.carbs ?? 0,
        },
        fat: {
          consumed: calculateFat(foodEntries),
          goal: adjustedGoals?.fat ?? goals.fat ?? 0,
        },
        fiber: {
          consumed: calculateFiber(foodEntries),
          goal: goals.dietary_fiber || 0,
        },
        waterConsumed: waterIntake.water_ml || 0,
        waterGoal: goals.water_goal_ml ?? 2500,
        foodEntries,
        exerciseEntries,
        calorieBalance: resolvedCalorieBalance,
      };
    },
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
