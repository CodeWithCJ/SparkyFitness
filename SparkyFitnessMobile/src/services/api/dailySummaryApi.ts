import { apiFetch } from './apiClient';
import type { DailySummaryResponse } from '@workspace/shared';
import type { FoodEntry } from '../../types/foodEntries';

type DailySummaryApiResponse = Omit<DailySummaryResponse, 'foodEntries'> & {
  foodEntries: FoodEntry[];
};

export const fetchDailySummary = (
  date: string,
): Promise<DailySummaryApiResponse> =>
  apiFetch<DailySummaryApiResponse>({
    endpoint: `/api/daily-summary?date=${encodeURIComponent(date)}`,
    serviceName: 'Daily Summary API',
    operation: 'fetch daily summary',
  });
