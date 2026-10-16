import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchMoodEntries } from '../services/api/moodApi';
import { addDays } from '../utils/dateUtils';
import { buildMoodReport } from '../utils/moodReport';
import type { ReportWindow } from '../utils/trendRange';
import { moodEntriesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Mood for a window and the one before it, so the report can show the change. */
export function useMoodReport({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const [current, previous] = useQueries({
    queries: [
      {
        queryKey: moodEntriesQueryKey(startDate, endDate),
        queryFn: () => fetchMoodEntries(startDate, endDate),
      },
      {
        queryKey: moodEntriesQueryKey(previousStart, previousEnd),
        queryFn: () => fetchMoodEntries(previousStart, previousEnd),
      },
    ],
  });

  useRefetchOnFocus(current.refetch);

  const report = useMemo(
    () =>
      current.data ? buildMoodReport(current.data, startDate, days) : null,
    [current.data, startDate, days]
  );
  const previousReport = useMemo(
    () =>
      previous.data
        ? buildMoodReport(previous.data, previousStart, days)
        : null,
    [previous.data, previousStart, days]
  );

  return {
    report,
    previousReport,
    isLoading: current.isLoading,
    isError: current.isError,
  };
}
