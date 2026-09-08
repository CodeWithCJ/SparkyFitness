import { useQuery } from '@tanstack/react-query';
import { fetchWaterIntakeRange } from '../services/api/measurementsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { waterIntakeRangeQueryKey } from './queryKeys';
import { getTodayDate, addDays } from '../utils/dateUtils';
import {
  RANGE_DAYS,
  type HealthTrendDateRange,
  type HydrationDataPoint,
} from '../types/healthTrends';

interface UseHydrationRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

export function useHydrationRange({
  range,
  enabled = true,
}: UseHydrationRangeOptions) {
  const today = getTodayDate();
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: waterIntakeRangeQueryKey(startDate, today),
    queryFn: () => fetchWaterIntakeRange(startDate, today),
    enabled,
    select: (entries) => {
      const millilitersByDay = new Map<string, number>();
      for (const entry of entries) {
        millilitersByDay.set(entry.entry_date, entry.water_ml);
      }

      // A day with no logged water genuinely means zero drunk, so every day in the
      // window gets a bar rather than being omitted the way a missing weigh-in is.
      const hydrationData: HydrationDataPoint[] = [];
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const day = addDays(today, -(days - 1 - dayOffset));
        hydrationData.push({
          day,
          milliliters: millilitersByDay.get(day) ?? 0,
        });
      }

      return hydrationData;
    },
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    hydrationData: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
