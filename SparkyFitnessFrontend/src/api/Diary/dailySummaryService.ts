import { apiCall } from '../api';
import type {
  DailySummaryRangeResponse,
  DailySummaryResponse,
} from '@workspace/shared';

export const loadDailySummary = (date: string): Promise<DailySummaryResponse> =>
  apiCall(`/daily-summary?date=${encodeURIComponent(date)}`, {
    method: 'GET',
  });

/**
 * Per-day calorie balance for a date range, computed server-side by the same code path
 * as `loadDailySummary`.
 *
 * Reports uses this instead of deriving the balance from raw exercise entries in the
 * browser. That derivation was issue #2094: it summed the device "Active Calories" row
 * on top of logged workouts, never saw step calories, and ignored the
 * "Include BMR in Net Calories" preference.
 */
export const loadDailySummaryRange = (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<DailySummaryRangeResponse> => {
  const params = new URLSearchParams({ startDate, endDate });
  if (userId) params.set('userId', userId);
  return apiCall(`/daily-summary/range?${params.toString()}`, {
    method: 'GET',
  });
};
