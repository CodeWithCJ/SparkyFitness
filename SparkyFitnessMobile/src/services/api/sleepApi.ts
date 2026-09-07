import type { SleepEntry } from '../../types/sleep';
import { apiFetch } from './apiClient';

/**
 * Fetches the individual sleep sessions filed between two calendar days, inclusive.
 *
 * Each row carries its stage breakdown, SpO2, resting heart rate, and a `stage_events`
 * array, so one call supplies both the Diary cards and the whole Sleep Details screen.
 * `GET /api/sleep/details` returns an identical payload from the same repository
 * function; there is deliberately no second client for it.
 */
export const fetchSleepEntries = async (
  startDate: string,
  endDate: string
): Promise<SleepEntry[]> => {
  return apiFetch<SleepEntry[]>({
    endpoint: `/api/sleep?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Sleep API',
    operation: 'fetch sleep entries',
  });
};
