import { useQuery } from '@tanstack/react-query';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsRange,
  fetchDailyVo2Max,
} from '../services/api/measurementsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { vo2MaxRangeQueryKey } from './queryKeys';
import { addDays, getTodayDate } from '../utils/dateUtils';
import {
  RANGE_DAYS,
  type HealthTrendDateRange,
  type Vo2MaxDataPoint,
} from '../types/healthTrends';

/** The category name health sync files VO2 max under (`HealthMetrics` `type`). */
const VO2_MAX_CATEGORY = 'vo2_max';

/** The latest synced custom-measurement reading per day, as [day, value]. */
async function customVo2Max(
  startDate: string,
  endDate: string
): Promise<[string, number][]> {
  const categories = await fetchCustomCategories();
  const category = categories.find((c) => c.name === VO2_MAX_CATEGORY);
  if (!category) return [];
  const entries = await fetchCustomMeasurementsRange(
    category.id,
    startDate,
    endDate
  );
  const latest = new Map<string, { at: string; value: number }>();
  for (const entry of entries) {
    const value = Number(entry.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const at = entry.entry_timestamp ?? '';
    const seen = latest.get(entry.entry_date);
    if (!seen || at >= seen.at) latest.set(entry.entry_date, { at, value });
  }
  return [...latest.entries()].map(([day, { value }]) => [day, value]);
}

interface UseVo2MaxRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

/**
 * VO2 max over the window, one reading per day (the latest if there are
 * several). Empty when nothing has synced it, which hides the trend.
 */
export function useVo2MaxRange({
  range,
  enabled = true,
}: UseVo2MaxRangeOptions) {
  const today = getTodayDate();
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));

  const query = useQuery({
    queryKey: vo2MaxRangeQueryKey(startDate, today),
    queryFn: async (): Promise<Vo2MaxDataPoint[]> => {
      // Two homes for the same reading: phone health sync files a custom
      // measurement, providers such as Garmin fill the daily metrics. The
      // phone's own reading wins on a day that has both.
      const [custom, daily] = await Promise.all([
        customVo2Max(startDate, today).catch(() => []),
        fetchDailyVo2Max(startDate, today).catch(() => []),
      ]);
      const byDay = new Map<string, number>(custom);
      for (const row of daily) {
        const day = row.entry_date.slice(0, 10);
        const value = Number(row.vo2_max);
        if (!byDay.has(day) && Number.isFinite(value) && value > 0) {
          byDay.set(day, value);
        }
      }
      return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, vo2max]) => ({ day, vo2max }));
    },
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    vo2MaxData: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
