import { useQuery } from '@tanstack/react-query';
import { readWaitingForDay } from '../offline/dailySummaryOverlay';
import {
  applyWaitingToRawData,
  buildDailySummary,
} from '../services/dailySummaryService';
import type { DailyGoals } from '../types/goals';
import { dailySummaryQueryKey } from './queryKeys';

const NO_GOALS: DailyGoals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  dietary_fiber: 0,
};

/**
 * What the Dashboard shows for a day the phone holds no saved summary of while
 * the server is away: no totals, only what is waiting to upload, so the water
 * card still works and the calorie cards stay hidden. Under the day's summary
 * key, so anything that refreshes that day refreshes this too.
 */
export function useWaitingWaterSummary(date: string, enabled: boolean) {
  return useQuery({
    queryKey: [...dailySummaryQueryKey(date), 'waitingOnly'],
    queryFn: async () =>
      buildDailySummary(
        date,
        applyWaitingToRawData(
          {
            goals: NO_GOALS,
            foodEntries: [],
            exerciseEntries: [],
            waterIntake: { water_ml: 0 },
            stepCalories: 0,
          },
          await readWaitingForDay(date)
        )
      ),
    enabled,
  }).data;
}
