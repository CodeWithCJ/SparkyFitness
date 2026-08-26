import type { SleepAnalyticsDay } from '../../types/sleep';
import { apiFetch } from './apiClient';

/**
 * Fetches per-day aggregated sleep for a calendar-day range, inclusive of both ends.
 */
export const fetchSleepAnalytics = async (
  startDate: string,
  endDate: string,
): Promise<SleepAnalyticsDay[]> => {
  return apiFetch<SleepAnalyticsDay[]>({
    endpoint: `/api/sleep/analytics?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Sleep API',
    operation: 'fetch sleep analytics',
  });
};
