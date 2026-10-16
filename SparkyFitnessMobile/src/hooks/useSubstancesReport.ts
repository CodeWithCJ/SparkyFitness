import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchNutritionTrends } from '../services/api/reportsApi';
import { fetchGoalsRange } from '../services/api/goalsApi';
import { addDays } from '../utils/dateUtils';
import {
  buildSubstancesReport,
  padSubstancePoints,
} from '../utils/substancesReport';
import type { ReportWindow } from '../utils/trendRange';
import { goalsRangeQueryKey, nutritionTrendsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The Caffeine and alcohol report. It reads the daily nutrition totals and goals the
 * Nutrition report already loads, on the same cache keys, so a window both have open is
 * one request.
 */
export function useSubstancesReport({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const [current, previous, goals] = useQueries({
    queries: [
      {
        queryKey: nutritionTrendsQueryKey(startDate, endDate),
        queryFn: () => fetchNutritionTrends(startDate, endDate),
      },
      {
        queryKey: nutritionTrendsQueryKey(previousStart, previousEnd),
        queryFn: () => fetchNutritionTrends(previousStart, previousEnd),
      },
      {
        queryKey: goalsRangeQueryKey(startDate, endDate, true),
        queryFn: () => fetchGoalsRange(startDate, endDate, true),
      },
    ],
  });

  useRefetchOnFocus(current.refetch);

  const report = useMemo(() => {
    if (!current.data) return null;
    const points = padSubstancePoints(current.data, startDate, days);
    const goalSets = points.map((point) => goals.data?.[point.date] ?? null);
    return {
      goalSets,
      ...buildSubstancesReport(
        points,
        padSubstancePoints(previous.data ?? [], previousStart, days),
        goalSets
      ),
    };
  }, [current.data, previous.data, goals.data, startDate, previousStart, days]);

  return { report, isLoading: current.isLoading, isError: current.isError };
}
