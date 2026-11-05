import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  buildDayHeartRateTimeline,
  dailyHeartRateAverages,
  sleepWindowForDay,
} from '@workspace/shared';
import { fetchHeartRateSamples } from '../services/api/exerciseStatsApi';
import { fetchSleepEntries } from '../services/api/sleepApi';
import { addDays } from '../utils/dateUtils';
import {
  deviceClockParts,
  heartRateReadingsForDay,
  workoutBandsFromSessions,
} from '../utils/heartRateDayTimeline';
import {
  heartRateDaySleepQueryKey,
  heartRateSamplesQueryKey,
} from './queryKeys';
import { useDailySummary } from './useDailySummary';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Raw heart rate samples for a window of days (one row per source per day). */
export function useHeartRateSamples(
  startDate: string,
  endDate: string,
  enabled = true
) {
  const query = useQuery({
    queryKey: heartRateSamplesQueryKey(startDate, endDate),
    queryFn: () => fetchHeartRateSamples(startDate, endDate),
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return query;
}

/** One average (with low and high) per day of the window, for the range chart. */
export function useHeartRateDailyAverages(startDate: string, endDate: string) {
  const query = useHeartRateSamples(startDate, endDate);
  const days = useMemo(() => dailyHeartRateAverages(query.data), [query.data]);
  return { days, isLoading: query.isLoading, isError: query.isError };
}

/** The 24 hour view of one day: readings, sleep, workouts and the day's figures. */
export function useHeartRateDayTimeline(
  day: string,
  workoutFallbackName: string
) {
  // Rows are filed by the account's timezone and readings placed by the
  // device clock, so read the neighbouring days too
  const samples = useHeartRateSamples(addDays(day, -1), addDays(day, 1));
  const sleep = useQuery({
    queryKey: heartRateDaySleepQueryKey(day),
    queryFn: () => fetchSleepEntries(addDays(day, -1), addDays(day, 1)),
  });
  const { summary, isError: summaryError } = useDailySummary({ date: day });

  const workouts = useMemo(
    () =>
      workoutBandsFromSessions(summary?.exerciseEntries, workoutFallbackName),
    [summary?.exerciseEntries, workoutFallbackName]
  );

  const timeline = useMemo(
    () =>
      buildDayHeartRateTimeline(
        heartRateReadingsForDay(samples.data, day),
        workouts,
        sleepWindowForDay(sleep.data ?? [], day, deviceClockParts)
      ),
    [samples.data, sleep.data, workouts, day]
  );

  // The day's figures split readings by sleep, so they wait for sleep too;
  // a failed daily summary would silently drop the workout shading
  return {
    timeline,
    workouts,
    isLoading: samples.isLoading || sleep.isLoading,
    isError: samples.isError || sleep.isError || summaryError,
  };
}
