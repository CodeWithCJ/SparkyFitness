import type { DailyNeedData } from '@workspace/shared';
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

/**
 * Tonight's sleep need and what it is made of: the baseline, the extra from the
 * day's logged workouts (strain) and from sleep debt. `training_load_score` is
 * null when no workout was logged that day, which is not the same as a rest
 * score of 0. With no date the server uses today in the account's timezone.
 */
export const fetchDailySleepNeed = async (): Promise<DailyNeedData> => {
  return apiFetch<DailyNeedData>({
    endpoint: '/api/sleep-science/daily-need',
    serviceName: 'Sleep Science API',
    operation: 'fetch daily sleep need',
  });
};
