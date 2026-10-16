import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  buildRunningTrends,
  startOfWeek,
  type ExerciseActivityQueryItem,
  type WeekStart,
} from '@workspace/shared';
import { queryExerciseActivities } from '@/api/Reports/exerciseStatsService';

/** Weeks of running the trends card covers. */
export const RUNNING_TRENDS_WEEKS = 12;
const PAGE_SIZE = 100;
/** A safety stop; twelve weeks of workouts is a few pages at most. */
const MAX_PAGES = 10;

async function fetchWindow(
  startDate: string,
  endDate: string,
  userId?: string
): Promise<ExerciseActivityQueryItem[]> {
  const items: ExerciseActivityQueryItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await queryExerciseActivities({
      startDate,
      endDate,
      userId,
      unitSystem: 'metric',
      page,
      pageSize: PAGE_SIZE,
      sortBy: 'entry_date',
      sortOrder: 'desc',
    });
    items.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return items;
}

/**
 * Weekly mileage, longest run and efficiency for the last twelve weeks, with
 * weeks beginning on the account's first day of the week. The same figures as
 * the mobile Cardio view, from the shared `buildRunningTrends`.
 */
export const useRunningTrends = (
  today: string,
  weekStartsOn: WeekStart,
  userId?: string
) => {
  const startDate = addDays(
    startOfWeek(today, weekStartsOn),
    -7 * (RUNNING_TRENDS_WEEKS - 1)
  );
  const query = useQuery({
    queryKey: ['runningTrends', startDate, today, userId],
    queryFn: () => fetchWindow(startDate, today, userId),
  });
  const trends = useMemo(
    () =>
      query.data
        ? buildRunningTrends(query.data, {
            today,
            weeks: RUNNING_TRENDS_WEEKS,
            weekStartsOn,
          })
        : null,
    [query.data, today, weekStartsOn]
  );
  return { trends, isLoading: query.isLoading, isError: query.isError };
};
