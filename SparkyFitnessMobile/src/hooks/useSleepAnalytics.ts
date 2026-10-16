import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchSleepEntries } from '../services/api/sleepApi';
import { addDays } from '../utils/dateUtils';
import { buildSleepAnalytics } from '../utils/sleepAnalytics';
import type { ReportWindow } from '../utils/trendRange';
import { sleepRangeQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Nightly sleep metrics for a window and the one before it (for change figures). The
 * current window shares `sleepRangeQueryKey` with the Health Trends sleep chart, so a
 * window both have open is one request and a health sync refreshes both.
 */
export function useSleepAnalytics({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const [current, previous] = useQueries({
    queries: [
      {
        queryKey: sleepRangeQueryKey(startDate, endDate),
        queryFn: () => fetchSleepEntries(startDate, endDate),
      },
      {
        queryKey: sleepRangeQueryKey(previousStart, previousEnd),
        queryFn: () => fetchSleepEntries(previousStart, previousEnd),
      },
    ],
  });

  useRefetchOnFocus(current.refetch);

  const analytics = useMemo(
    () =>
      current.data ? buildSleepAnalytics(current.data, startDate, days) : null,
    [current.data, startDate, days]
  );
  const previousAnalytics = useMemo(
    () =>
      previous.data
        ? buildSleepAnalytics(previous.data, previousStart, days)
        : null,
    [previous.data, previousStart, days]
  );

  return {
    analytics,
    previousAnalytics,
    isLoading: current.isLoading,
    isError: current.isError,
  };
}
