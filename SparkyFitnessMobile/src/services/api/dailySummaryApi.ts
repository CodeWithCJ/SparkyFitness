import { apiFetch } from './apiClient';
import type { DailyGoals } from '../../types/goals';
import type { FoodEntry } from '../../types/foodEntries';
import type { ExerciseSessionResponse, CalorieBalance, SupplementTotals } from '@workspace/shared';

export interface DailySummaryApiResponse {
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

export const fetchDailySummary = (date: string, userId?: string): Promise<DailySummaryApiResponse> => {
  const params = new URLSearchParams({ date });
  if (userId) params.set('userId', userId);

  return apiFetch<DailySummaryApiResponse>({
    endpoint: `/api/daily-summary?${params.toString()}`,
    serviceName: 'Daily Summary API',
    operation: userId ? 'fetch family daily summary' : 'fetch daily summary',
  });
};
