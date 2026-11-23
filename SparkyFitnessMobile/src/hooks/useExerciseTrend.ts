import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  buildExerciseTrend,
  countedTrendSets,
  exerciseTrendPeriodStart,
  exerciseTrendWindowStart,
  toWeekStart,
  type ExerciseTrendMetric,
  type ExerciseTrendPeriod,
} from '@workspace/shared';
import { fetchExerciseProgress } from '../services/api/exerciseApi';
import { exerciseProgressQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';
import { getTodayDate } from '../utils/dateUtils';

/**
 * One exercise's trend for the exercise detail card: the last 12 weeks, the
 * last 12 months or all history by year, one point per period, built by the
 * shared `buildExerciseTrend` (no warm-ups, no sets without reps, nothing
 * from a row `isPlannedEntryRow` calls planned). Weeks begin on the
 * account's first day of the week.
 */
export function useExerciseTrend(
  exerciseId: string | null,
  period: ExerciseTrendPeriod,
  metric: ExerciseTrendMetric
) {
  const { preferences } = usePreferences();
  const weekStartsOn = toWeekStart(preferences?.first_day_of_week);
  const today = getTodayDate();
  const startDate = exerciseTrendWindowStart(today, period, weekStartsOn);

  const query = useQuery({
    queryKey: exerciseProgressQueryKey(exerciseId ?? '', startDate, today),
    // The result carries the grouping it was fetched for, so the previous
    // window kept on screen while a new period loads is never re-grouped.
    queryFn: async () => ({
      entries: await fetchExerciseProgress(exerciseId!, startDate, today),
      period,
      weekStartsOn,
    }),
    enabled: !!exerciseId,
    // Switching period keeps the old line up until the new window arrives.
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const points = useMemo(
    () =>
      data
        ? buildExerciseTrend(data.entries, {
            metric,
            period: data.period,
            weekStartsOn: data.weekStartsOn,
          })
        : [],
    [data, metric]
  );
  const shownPeriod = data?.period ?? period;
  // Done sessions in the window shown, so the card can wait for two.
  const sessionCount = useMemo(
    () =>
      data
        ? data.entries.filter((entry) => countedTrendSets(entry).length > 0)
            .length
        : 0,
    [data]
  );

  return {
    points,
    sessionCount,
    /** The grouping `points` are in (the previous one while a period loads). */
    period: shownPeriod,
    /** First day of the period holding today, which is still filling up. */
    currentPeriodStart: exerciseTrendPeriodStart(
      today,
      shownPeriod,
      weekStartsOn
    ),
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
