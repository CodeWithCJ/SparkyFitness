import { apiFetch } from './apiClient';
import type { DailyGoals } from '../../types/goals';
import type { FoodEntry } from '../../types/foodEntries';
import type { ExerciseSessionResponse, CalorieBalance } from '@workspace/shared';

interface DailySummaryApiResponse {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseSessions: ExerciseSessionResponse[];
  waterIntake: number;
  stepCalories?: number;
  calorieBalance?: CalorieBalance;
  adjustedGoals?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
  appleExerciseTime?: number | null;
  appleMoveTime?: number | null;
  /** @deprecated Backward-compat alias; use appleStandHours. */
  appleStandTime?: number | null;
  appleStandHours?: number | null;
}

export const fetchDailySummary = (date: string): Promise<DailySummaryApiResponse> =>
  apiFetch<DailySummaryApiResponse>({
    endpoint: `/api/daily-summary?date=${encodeURIComponent(date)}`,
    serviceName: 'Daily Summary API',
    operation: 'fetch daily summary',
  });
