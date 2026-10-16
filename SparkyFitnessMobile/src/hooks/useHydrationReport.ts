import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchWaterIntakeRange } from '../services/api/measurementsApi';
import { fetchGoalsRange } from '../services/api/goalsApi';
import { addDays } from '../utils/dateUtils';
import {
  buildHydrationInsights,
  type HydrationDay,
} from '../utils/hydrationReport';
import type { ReportWindow } from '../utils/trendRange';
import { goalsRangeQueryKey, waterIntakeRangeQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const toDays = (
  entries: { entry_date: string; water_ml: number }[],
  startDate: string,
  days: number
): HydrationDay[] => {
  const byDay = new Map(entries.map((e) => [e.entry_date, e.water_ml]));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(startDate, i);
    return { day, milliliters: byDay.get(day) ?? 0 };
  });
};

/**
 * The Hydration report: this window, the one before it (for the change figure) and the
 * daily water goal. The current window and goals share cache keys with the Health Trends
 * hydration chart, so a window both have open is one request.
 */
export function useHydrationReport({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const [current, previous, goals] = useQueries({
    queries: [
      {
        queryKey: waterIntakeRangeQueryKey(startDate, endDate),
        queryFn: () => fetchWaterIntakeRange(startDate, endDate),
      },
      {
        queryKey: waterIntakeRangeQueryKey(previousStart, previousEnd),
        queryFn: () => fetchWaterIntakeRange(previousStart, previousEnd),
      },
      {
        queryKey: goalsRangeQueryKey(startDate, endDate, false),
        queryFn: () => fetchGoalsRange(startDate, endDate, false),
      },
    ],
  });

  useRefetchOnFocus(current.refetch);

  const report = useMemo(() => {
    if (!current.data) return null;
    const series = toDays(current.data, startDate, days);
    const dayGoals = series.map(
      (point) => goals.data?.[point.day]?.water_goal_ml ?? null
    );
    return {
      series,
      goals: dayGoals,
      insights: buildHydrationInsights(
        series,
        toDays(previous.data ?? [], previousStart, days),
        dayGoals
      ),
    };
  }, [current.data, previous.data, goals.data, startDate, previousStart, days]);

  return { report, isLoading: current.isLoading, isError: current.isError };
}
