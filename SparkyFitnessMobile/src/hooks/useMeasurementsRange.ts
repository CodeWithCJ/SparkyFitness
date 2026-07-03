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
        if (!weightMap.has(entry.entry_date) && entry.weight != null && entry.weight > 0) {
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

  return {
    stepsData: query.data?.stepsData ?? [],
    weightData: query.data?.weightData ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
