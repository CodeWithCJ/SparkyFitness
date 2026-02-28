import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMeasurementsRange } from '../services/api/measurementsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { measurementsRangeQueryKey } from './queryKeys';
import { getTodayDate, addDays } from '../utils/dateUtils';

export type StepsRange = '7d' | '30d' | '90d';

export type StepsDataPoint = {
  day: string;
  steps: number;
};

export type WeightDataPoint = {
  day: string;
  weight: number;
};

const RANGE_DAYS: Record<StepsRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface UseMeasurementsRangeOptions {
  range: StepsRange;
  enabled?: boolean;
}

export function useMeasurementsRange({ range, enabled = true }: UseMeasurementsRangeOptions) {
  const today = getTodayDate();
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));

  const query = useQuery({
    queryKey: measurementsRangeQueryKey(startDate, today),
    queryFn: () => fetchMeasurementsRange(startDate, today),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  const stepsData = useMemo<StepsDataPoint[]>(() => {
    const days = RANGE_DAYS[range];
    const dateMap = new Map<string, number>();

    // API returns DESC by updated_at — first entry per date is the most recent
    if (query.data) {
      for (const entry of query.data) {
        if (!dateMap.has(entry.entry_date)) {
          dateMap.set(entry.entry_date, entry.steps ?? 0);
        }
      }
    }

    // Fill all days in range, chronologically ascending
    const result: StepsDataPoint[] = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(today, -(days - 1 - i));
      result.push({
        day,
        steps: dateMap.get(day) ?? 0,
      });
    }

    return result;
  }, [query.data, range, today]);

  const weightData = useMemo<WeightDataPoint[]>(() => {
    const dateMap = new Map<string, number>();

    // API returns DESC by updated_at — first entry per date is the most recent
    if (query.data) {
      for (const entry of query.data) {
        if (!dateMap.has(entry.entry_date) && entry.weight != null && entry.weight > 0) {
          dateMap.set(entry.entry_date, entry.weight);
        }
      }
    }

    // Only include days with weight data, chronologically ascending
    const days = RANGE_DAYS[range];
    const result: WeightDataPoint[] = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(today, -(days - 1 - i));
      const weight = dateMap.get(day);
      if (weight != null) {
        result.push({ day, weight });
      }
    }

    return result;
  }, [query.data, range, today]);

  return {
    stepsData,
    weightData,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
