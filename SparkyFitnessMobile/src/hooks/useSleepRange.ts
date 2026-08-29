import { useQuery } from '@tanstack/react-query';
import { isValidTimeZone, todayInZone } from '@workspace/shared';
import { ApiError } from '../services/api/errors';
import { fetchSleepAnalytics } from '../services/api/sleepApi';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import type { SleepAnalyticsDay, SleepDataPoint } from '../types/sleep';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { usePreferences } from './usePreferences';
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

/**
 * Today as the account sees it, not as the phone does.
 *
 * The server buckets sleep by `entry_date` in the profile timezone, so a device sitting in
 * a different zone asks for — and labels the chart's last column with — a day the account
 * has not reached (or has already left). Falls back to device-local while preferences are
 * still loading or hold a timezone this runtime cannot resolve.
 */
const resolveToday = (timezone: string | null | undefined): string =>
  timezone && isValidTimeZone(timezone) ? todayInZone(timezone) : getTodayDate();

export function useSleepRange({ range, enabled = true }: UseSleepRangeOptions) {
  const { preferences } = usePreferences({ enabled });
  const today = resolveToday(preferences?.timezone);
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
