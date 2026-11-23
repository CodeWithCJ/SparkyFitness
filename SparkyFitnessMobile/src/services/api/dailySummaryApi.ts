import { apiFetch } from './apiClient';
import { accountGeneration } from '../../offline/accountGeneration';
import {
  readSavedDailySummary,
  storeDailySummary,
} from '../../offline/dailySummaryCache';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import { saveDiaryDayFood, saveDiaryDayWorkouts } from '../../offline/diaryDay';
import type { DailyGoals } from '../../types/goals';
import type { FoodEntry } from '../../types/foodEntries';
import type {
  ExerciseSessionResponse,
  CalorieBalance,
  SupplementTotals,
  WaterIntakeBreakdown,
  AdjustedGoals,
  CalorieCyclingDay,
} from '@workspace/shared';

export interface DailySummaryApiResponse {
  goals: DailyGoals;
  foodEntries: FoodEntry[];
  exerciseSessions: ExerciseSessionResponse[];
  waterIntake: number;
  // #1557, #1629: present only when includeCheckin fetched water at all
  // (server dailySummaryService.ts), absent on an older server.
  waterIntakeBreakdown?: WaterIntakeBreakdown | null;
  stepCalories?: number;
  calorieBalance?: CalorieBalance;
  // Optional: a client can outrun the server it talks to, and supplement totals only exist
  // on servers new enough to send them.
  supplementTotals?: SupplementTotals;
  adjustedGoals?: AdjustedGoals | null;
  /** How calorie cycling set the day's goal (#2327); absent when off or on older servers. */
  calorieCycling?: CalorieCyclingDay;
}

export const fetchDailySummary = (
  date: string,
  userId?: string
): Promise<DailySummaryApiResponse> => {
  const params = new URLSearchParams({ date });
  if (userId) params.set('userId', userId);

  const fetchFromServer = () =>
    apiFetch<DailySummaryApiResponse>({
      endpoint: `/api/daily-summary?${params.toString()}`,
      serviceName: 'Daily Summary API',
      operation: userId ? 'fetch family daily summary' : 'fetch daily summary',
    });
  // A family member's day is never kept on the phone.
  if (userId) return fetchFromServer();

  // The person's own day is kept, so the Diary's totals and goals can be shown
  // with no connection (#1983). The saved copy has no waiting uploads in it;
  // `loadDailySummaryRawData` adds those.
  // Set only when the server answered: a copy read from the phone because the
  // server is away must not be written back into the Diary's saved days, where
  // it could replace newer entries.
  let answeredByServer = false;
  const request = withOfflineFallback<DailySummaryApiResponse>({
    fetch: async () => {
      const summary = await fetchFromServer();
      answeredByServer = true;
      return summary;
    },
    store: (db, serverConfigId, summary) =>
      storeDailySummary(db, serverConfigId, date, summary),
    read: (db, serverConfigId) =>
      readSavedDailySummary(db, serverConfigId, date),
  });
  // The day's own workouts and food are kept for the offline Diary's list.
  // Saved only if the account is still the one that asked.
  const requestedUnder = accountGeneration();
  void request
    .then(async (summary) => {
      if (!answeredByServer) return;
      await saveDiaryDayWorkouts(
        date,
        summary.exerciseSessions,
        requestedUnder
      );
      await saveDiaryDayFood(date, summary.foodEntries, requestedUnder);
    })
    .catch(() => undefined);
  return request;
};
