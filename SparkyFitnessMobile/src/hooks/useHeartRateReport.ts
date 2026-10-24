import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsRange,
  fetchDailyHeartRateMetrics,
} from '../services/api/measurementsApi';
import { fetchSleepEntries } from '../services/api/sleepApi';
import { addDays } from '../utils/dateUtils';
import type { ReportWindow } from '../utils/trendRange';
import { heartRateReportQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { HeartRateDataPoint } from '../types/healthTrends';

const RESTING_HEART_RATE_CATEGORY = 'resting_heart_rate';

export async function fetchRestingHeartRateSeries(
  startDate: string,
  endDate: string
): Promise<{
  points: HeartRateDataPoint[];
  avgRecovery1Min: number | null;
}> {
  const [categories, daily, sleep] = await Promise.all([
    fetchCustomCategories(),
    fetchDailyHeartRateMetrics(startDate, endDate),
    fetchSleepEntries(startDate, endDate),
  ]);

  const cat = Array.isArray(categories)
    ? categories.find(
        (c: { name: string }) => c.name === RESTING_HEART_RATE_CATEGORY
      )
    : undefined;
  const customEntries = cat?.id
    ? await fetchCustomMeasurementsRange(cat.id, startDate, endDate)
    : [];

  // Newest custom reading of each day wins
  const customByDay = new Map<string, { value: number; at: string }>();
  const byDay = new Map<string, number>();

  if (Array.isArray(customEntries)) {
    for (const entry of customEntries) {
      if (!entry?.entry_date) continue;
      const value = Number(entry.value);
      if (!Number.isFinite(value) || value <= 0) continue;
      const at = entry.entry_timestamp ?? '';
      const seen = customByDay.get(entry.entry_date);
      if (!seen || at >= seen.at) {
        customByDay.set(entry.entry_date, { value, at });
      }
    }
    customByDay.forEach(({ value }, day) => byDay.set(day, value));
  }

  const recoveryValues: number[] = [];
  if (Array.isArray(daily)) {
    for (const row of daily) {
      if (!row?.entry_date) continue;
      const day = String(row.entry_date).slice(0, 10);
      const value = Number(row.resting_heart_rate);
      if (!byDay.has(day) && Number.isFinite(value) && value > 0) {
        byDay.set(day, value);
      }
      if (row.heart_rate_recovery_1min && row.heart_rate_recovery_1min > 0) {
        recoveryValues.push(row.heart_rate_recovery_1min);
      }
    }
  }

  if (Array.isArray(sleep)) {
    for (const row of sleep) {
      if (!row?.entry_date) continue;
      const day = String(row.entry_date).slice(0, 10);
      const value = Number(row.resting_heart_rate);
      if (!byDay.has(day) && Number.isFinite(value) && value > 0) {
        byDay.set(day, value);
      }
    }
  }

  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, restingHr]) => ({
      day,
      restingHr: Math.round(restingHr),
    }));

  const avgRecovery1Min =
    recoveryValues.length > 0
      ? Math.round(
          recoveryValues.reduce((s, v) => s + v, 0) / recoveryValues.length
        )
      : null;

  return { points, avgRecovery1Min };
}

export interface HeartRateReportData {
  days: HeartRateDataPoint[];
  averageRestingHr: number | null;
  minRestingHr: number | null;
  maxRestingHr: number | null;
  previousAverageRestingHr: number | null;
  restingHrChange: number | null;
  avgRecovery1Min: number | null;
  daysWithData: number;
  totalDaysInWindow: number;
}

export function useHeartRateReport({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const currentQuery = useQuery({
    queryKey: heartRateReportQueryKey(startDate, endDate),
    queryFn: () => fetchRestingHeartRateSeries(startDate, endDate),
  });

  const previousQuery = useQuery({
    queryKey: heartRateReportQueryKey(previousStart, previousEnd),
    queryFn: () => fetchRestingHeartRateSeries(previousStart, previousEnd),
  });

  useRefetchOnFocus(currentQuery.refetch);

  const report = useMemo<HeartRateReportData | null>(() => {
    if (!currentQuery.data) return null;

    const currentData = currentQuery.data;
    const currentPoints: HeartRateDataPoint[] = Array.isArray(
      currentData?.points
    )
      ? currentData.points
      : Array.isArray(currentData)
        ? (currentData as HeartRateDataPoint[])
        : [];

    const hrValues = currentPoints
      .map((p) => p.restingHr)
      .filter((v) => Number.isFinite(v) && v > 0);

    const averageRestingHr =
      hrValues.length > 0
        ? Math.round(hrValues.reduce((s, v) => s + v, 0) / hrValues.length)
        : null;
    const minRestingHr = hrValues.length > 0 ? Math.min(...hrValues) : null;
    const maxRestingHr = hrValues.length > 0 ? Math.max(...hrValues) : null;

    const previousData = previousQuery.data;
    const prevPoints: HeartRateDataPoint[] = Array.isArray(previousData?.points)
      ? previousData.points
      : Array.isArray(previousData)
        ? (previousData as HeartRateDataPoint[])
        : [];
    const prevHrValues = prevPoints
      .map((p) => p.restingHr)
      .filter((v) => Number.isFinite(v) && v > 0);
    const previousAverageRestingHr =
      prevHrValues.length > 0
        ? Math.round(
            prevHrValues.reduce((s, v) => s + v, 0) / prevHrValues.length
          )
        : null;

    const restingHrChange =
      averageRestingHr !== null && previousAverageRestingHr !== null
        ? averageRestingHr - previousAverageRestingHr
        : null;

    return {
      days: currentPoints,
      averageRestingHr,
      minRestingHr,
      maxRestingHr,
      previousAverageRestingHr,
      restingHrChange,
      avgRecovery1Min: currentQuery.data.avgRecovery1Min,
      daysWithData: currentPoints.length,
      totalDaysInWindow: days,
    };
  }, [currentQuery.data, previousQuery.data, days]);

  return {
    report,
    isLoading: currentQuery.isLoading,
    isError: currentQuery.isError,
    refetch: currentQuery.refetch,
  };
}
