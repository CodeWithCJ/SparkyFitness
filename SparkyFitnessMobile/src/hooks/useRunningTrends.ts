import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  buildRunningTrends,
  predictRaceTimes,
  runningEfforts,
  startOfWeek,
  toWeekStart,
  type ExerciseActivityQueryItem,
} from '@workspace/shared';
import {
  fetchCardioSessionsPage,
  fetchPersonalRecords,
} from '../services/api/exerciseStatsApi';
import { runningRecordsQueryKey, runningTrendsQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';
import { getTodayDate } from '../utils/dateUtils';

/** Weeks of running shown on the trends card. */
export const RUNNING_TRENDS_WEEKS = 12;
const PAGE_SIZE = 100;
/** A safety stop; 12 weeks of workouts is a few pages at most. */
const MAX_PAGES = 10;

async function fetchWindow(
  startDate: string,
  endDate: string
): Promise<ExerciseActivityQueryItem[]> {
  const items: ExerciseActivityQueryItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchCardioSessionsPage({
      startDate,
      endDate,
      page,
      pageSize: PAGE_SIZE,
      unitSystem: 'metric',
    });
    items.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return items;
}

/**
 * Weekly mileage, longest run, efficiency and race-time estimates. Weeks begin
 * on the account's first day of the week. The keys sit in the `cardioSessions`
 * family, so the Cardio view's refresh and the exercise cache invalidation
 * reload them with the session list.
 */
export function useRunningTrends(enabled = true) {
  const { preferences } = usePreferences();
  const weekStartsOn = toWeekStart(preferences?.first_day_of_week);
  const today = getTodayDate();
  const startDate = addDays(
    startOfWeek(today, weekStartsOn),
    -7 * (RUNNING_TRENDS_WEEKS - 1)
  );

  const sessions = useQuery({
    queryKey: runningTrendsQueryKey(startDate, today),
    queryFn: () => fetchWindow(startDate, today),
    enabled,
  });
  const records = useQuery({
    queryKey: runningRecordsQueryKey(),
    queryFn: () => fetchPersonalRecords('metric'),
    enabled,
  });

  const trends = useMemo(
    () =>
      sessions.data
        ? buildRunningTrends(sessions.data, {
            today,
            weeks: RUNNING_TRENDS_WEEKS,
            weekStartsOn,
          })
        : null,
    [sessions.data, today, weekStartsOn]
  );
  const raceTimes = useMemo(
    () =>
      records.data
        ? predictRaceTimes(runningEfforts(records.data.cardioPRs))
        : [],
    [records.data]
  );

  return {
    trends,
    raceTimes,
    isLoading: sessions.isLoading,
    isError: sessions.isError,
  };
}
