import { apiCall } from '../api';
import type { DailySummaryResponse } from '@workspace/shared';

export const loadDailySummary = (date: string): Promise<DailySummaryResponse> =>
  apiCall(`/daily-summary?date=${encodeURIComponent(date)}`, {
    method: 'GET',
  });
