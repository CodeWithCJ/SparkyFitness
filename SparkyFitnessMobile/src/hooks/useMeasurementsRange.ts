import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMeasurementsRange } from '../services/api/measurementsApi';
import { fetchGoalsRange } from '../services/api/goalsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { measurementsRangeQueryKey, goalsRangeQueryKey } from './queryKeys';
import { getTodayDate, addDays } from '../utils/dateUtils';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';

export type StepsDataPoint = {
  day: string;
  steps: number;
};

export type WeightDataPoint = {
  day: string;
  weight: number;
};

interface UseMeasurementsRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

export function useMeasurementsRange({
  range,
  enabled = true,
}: UseMeasurementsRangeOptions) {
  const today = getTodayDate();
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: measurementsRangeQueryKey(startDate, today),
    queryFn: () => fetchMeasurementsRange(startDate, today),
    enabled,
    select: (data) => {
      const stepsMap = new Map<string, number>();
      const weightMap = new Map<string, number>();

      // API returns DESC by updated_at — first entry per date is the most recent
      for (const entry of data) {
        if (!stepsMap.has(entry.entry_date)) {
          stepsMap.set(entry.entry_date, entry.steps ?? 0);
        }
        if (
          !weightMap.has(entry.entry_date) &&
          entry.weight != null &&
          entry.weight > 0
        ) {
          weightMap.set(entry.entry_date, entry.weight);
        }
      }

      const stepsData: StepsDataPoint[] = [];
      const weightData: WeightDataPoint[] = [];

      // Fill all days in range, chronologically ascending
      for (let i = 0; i < days; i++) {
        const day = addDays(today, -(days - 1 - i));
        stepsData.push({ day, steps: stepsMap.get(day) ?? 0 });
        const weight = weightMap.get(day);
        if (weight != null) {
          weightData.push({ day, weight });
        }
      }

      return { stepsData, weightData };
    },
  });

  useRefetchOnFocus(query.refetch, enabled);

  // Raw (unadjusted) goal for each day; a day without a steps goal is null so the
  // chart draws no line for it.
  const {
    data: stepsGoals,
    isError: isGoalsError,
    refetch: refetchGoals,
  } = useQuery({
    queryKey: goalsRangeQueryKey(startDate, today, false),
    queryFn: () => fetchGoalsRange(startDate, today, false),
    enabled,
    select: (goalsByDay) => {
      const resolvedGoals: (number | null)[] = [];
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const day = addDays(today, -(days - 1 - dayOffset));
        const goal = goalsByDay[day]?.target_steps;
        resolvedGoals.push(goal && goal > 0 ? goal : null);
      }
      return resolvedGoals;
    },
  });

  useRefetchOnFocus(refetchGoals, enabled);

  const { refetch: refetchData } = query;
  const refetch = useCallback(async () => {
    await Promise.all([refetchData(), refetchGoals()]);
  }, [refetchData, refetchGoals]);

  return {
    stepsData: query.data?.stepsData ?? [],
    stepsGoals: stepsGoals ?? [],
    weightData: query.data?.weightData ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isStepsGoalsError: isGoalsError,
    refetch,
  };
}
