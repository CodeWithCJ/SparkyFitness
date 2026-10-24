import { useQuery } from '@tanstack/react-query';
import { fetchRestingHeartRateSeries } from './useHeartRateReport';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { heartRateRangeQueryKey } from './queryKeys';
import { addDays, getTodayDate } from '../utils/dateUtils';
import {
  RANGE_DAYS,
  type HealthTrendDateRange,
  type HeartRateDataPoint,
} from '../types/healthTrends';

interface UseHeartRateRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

export interface UseHeartRateRangeResult {
  heartRateData: HeartRateDataPoint[];
  averageRestingHr: number | null;
  minRestingHr: number | null;
  maxRestingHr: number | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Resting heart rate readings over the window, one reading per day.
 * Reuses fetchRestingHeartRateSeries to aggregate phone health sync
 * (custom_measurements), wearable provider summaries (daily_health_metrics),
 * and overnight sleep biometric entries into a single timeline.
 */
export function useHeartRateRange({
  range,
  enabled = true,
}: UseHeartRateRangeOptions): UseHeartRateRangeResult {
  const today = getTodayDate();
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));

  const query = useQuery({
    queryKey: heartRateRangeQueryKey(startDate, today),
    queryFn: async (): Promise<HeartRateDataPoint[]> => {
      const { points } = await fetchRestingHeartRateSeries(startDate, today);
      return points;
    },
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  const data = query.data ?? [];
  const hrValues = data.map((d) => d.restingHr).filter((v) => v > 0);
  const averageRestingHr =
    hrValues.length > 0
      ? Math.round(hrValues.reduce((s, v) => s + v, 0) / hrValues.length)
      : null;
  const minRestingHr = hrValues.length > 0 ? Math.min(...hrValues) : null;
  const maxRestingHr = hrValues.length > 0 ? Math.max(...hrValues) : null;

  return {
    heartRateData: data,
    averageRestingHr,
    minRestingHr,
    maxRestingHr,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
