import { apiFetch } from './apiClient';
import type { DailySummaryResponse } from '@workspace/shared';

export const fetchDailySummary = (date: string): Promise<DailySummaryResponse> =>
  apiFetch<DailySummaryResponse>({
    endpoint: `/api/daily-summary?date=${encodeURIComponent(date)}`,
    serviceName: 'Daily Summary API',
    operation: 'fetch daily summary',
  });
