import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../services/api/errors';
import { fetchSleepAnalytics } from '../services/api/sleepApi';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import type { SleepAnalyticsDay, SleepDataPoint } from '../types/sleep';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { sleepAnalyticsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const SECONDS_PER_HOUR = 3600;

const isForbiddenError = (error: unknown): boolean =>
  error instanceof ApiError && error.statusCode === 403;

interface UseSleepRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

/**
 * Maps the server's per-day analytics onto one point per day in the window.
 */
const buildSleepDataPoints = (
  analytics: SleepAnalyticsDay[],
  endDay: string,
  days: number,
): SleepDataPoint[] => {
  const hoursByDay = new Map<string, number>();
  for (const entry of analytics) {
    if (hoursByDay.has(entry.date)) continue;
    hoursByDay.set(entry.date, (entry.timeAsleep ?? 0) / SECONDS_PER_HOUR);
  }

  const points: SleepDataPoint[] = [];
  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = addDays(endDay, -(days - 1 - dayOffset));
    points.push({ day, hours: hoursByDay.get(day) ?? 0 });
  }
  return points;
};

export function useSleepRange({ range, enabled = true }: UseSleepRangeOptions) {
  const today = getTodayDate();
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: sleepAnalyticsQueryKey(startDate, today),
    queryFn: () => fetchSleepAnalytics(startDate, today),
    enabled,
    select: (data) => buildSleepDataPoints(data, today, days),
  });

  useRefetchOnFocus(query.refetch, enabled);

  // A delegate holding `checkin` but not `reports` is refused only this request. The
  // trends pager should drop the sleep page rather than show the whole dashboard an
  // error state, so a 403 reads as "no data" instead of a failure.
  const isForbidden = isForbiddenError(query.error);

  return {
    sleepData: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError && !isForbidden,
    refetch: query.refetch,
  };
}
