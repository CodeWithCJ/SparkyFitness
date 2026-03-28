import { useQuery } from '@tanstack/react-query';
import {
  calculateCaloriesConsumed,
  calculateProtein,
  calculateCarbs,
  calculateFat,
  calculateFiber,
} from '../services/api/foodEntriesApi';
import {
  calculateCaloriesBurned,
  calculateActiveCalories,
  calculateOtherExerciseCalories,
  calculateExerciseDuration,
} from '../services/api/exerciseApi';
import { fetchDailySummary } from '../services/api/dailySummaryApi';
import type { DailySummary } from '../types/dailySummary';
import type { DailyGoals } from '../types/goals';
import type { FoodEntry } from '../types/foodEntries';
import type { ExerciseSessionResponse } from '@workspace/shared';
import type { WaterIntake } from '../types/measurements';

import { useRefetchOnFocus } from './useRefetchOnFocus';
import { dailySummaryQueryKey } from './queryKeys';

export interface DailySummaryRawData {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseSessionResponse[];
  waterIntake: WaterIntake;
  stepCalories: number;
}

interface UseDailySummaryOptions {
  date: string;
  enabled?: boolean;
}

export function useDailySummary({ date, enabled = true }: UseDailySummaryOptions) {
  const query = useQuery({
    queryKey: dailySummaryQueryKey(date),
    queryFn: async () => {
      const data = await fetchDailySummary(date);
      return {
        goals: data.goals,
        foodEntries: data.foodEntries,
        exerciseEntries: data.exerciseSessions,
        waterIntake: { water_ml: data.waterIntake },
        stepCalories: data.stepCalories ?? 0,
      };
    },
    select: (raw): DailySummary => {
      const { goals, foodEntries, exerciseEntries, waterIntake, stepCalories } = raw;

      const calorieGoal = goals.calories || 0;
      const caloriesConsumed = calculateCaloriesConsumed(foodEntries);
      const caloriesBurned = calculateCaloriesBurned(exerciseEntries);
      const activeCalories = calculateActiveCalories(exerciseEntries);
      const otherExerciseCalories = calculateOtherExerciseCalories(exerciseEntries);
      const exerciseMinutes = calculateExerciseDuration(exerciseEntries);
      const netCalories = caloriesConsumed - caloriesBurned;
      const remainingCalories = calorieGoal - netCalories;

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
          goal: goals.protein || 0,
        },
        carbs: {
          consumed: calculateCarbs(foodEntries),
          goal: goals.carbs || 0,
        },
        fat: {
          consumed: calculateFat(foodEntries),
          goal: goals.fat || 0,
        },
        fiber: {
          consumed: calculateFiber(foodEntries),
          goal: goals.dietary_fiber || 0,
        },
        waterConsumed: waterIntake.water_ml || 0,
        waterGoal: goals.water_goal_ml ?? 2500,
        foodEntries,
        exerciseEntries,
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
