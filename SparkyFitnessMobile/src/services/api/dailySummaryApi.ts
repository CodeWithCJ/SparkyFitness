import { apiFetch } from './apiClient';
import type { DailyGoals } from '../../types/goals';
import type { FoodEntry } from '../../types/foodEntries';
import type { ExerciseSessionResponse, CalorieBalance, SupplementTotals } from '@workspace/shared';

interface DailySummaryApiResponse {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseSessions: ExerciseSessionResponse[];
  waterIntake: number;
  stepCalories?: number;
  calorieBalance?: CalorieBalance;
  // Optional: a client can outrun the server it talks to, and supplement totals only exist
  // on servers new enough to send them.
  supplementTotals?: SupplementTotals;
  adjustedGoals?: { calories: number; protein: number; carbs: number; fat: number } | null;
}

export const fetchDailySummary = (date: string): Promise<DailySummaryApiResponse> =>
  apiFetch<DailySummaryApiResponse>({
    endpoint: `/api/daily-summary?date=${encodeURIComponent(date)}`,
    serviceName: 'Daily Summary API',
    operation: 'fetch daily summary',
  });
