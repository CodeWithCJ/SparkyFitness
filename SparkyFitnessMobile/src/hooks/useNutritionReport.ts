import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchNutritionTrends } from '../services/api/reportsApi';
import { fetchGoalsRange } from '../services/api/goalsApi';
import { addDays } from '../utils/dateUtils';
import {
  buildNutritionInsights,
  toCaloriesSeries,
} from '../utils/nutritionReport';
import type { ReportWindow } from '../utils/trendRange';
import { goalsRangeQueryKey, nutritionTrendsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const emptyPoint = {
  date: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  saturated_fat: 0,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  trans_fat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  dietary_fiber: 0,
  sugars: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  calcium: 0,
  iron: 0,
  caffeine_mg: 0,
  water_ml: 0,
  alcohol_g: 0,
};

/**
 * The Nutrition report: this window, the one before it (for the change figure) and the
 * resolved calorie goal for each day. The current window and goals share cache keys with
 * the Dashboard's calories page, so they are not refetched when both are open.
 */
export function useNutritionReport({ window }: { window: ReportWindow }) {
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
    const byDay = new Map(current.data.map((point) => [point.date, point]));
    const points = Array.from({ length: days }, (_, index) => {
      const day = addDays(startDate, index);
      return byDay.get(day) ?? { ...emptyPoint, date: day };
    });
    const goalByDay = goals.data ?? {};
    const dayGoals = points.map((point) => {
      const dailyGoals = goalByDay[point.date];
      return dailyGoals ? dailyGoals.calories : null;
    });
    const macroGoals = {
      protein: points.map((point) => goalByDay[point.date]?.protein ?? null),
      carbs: points.map((point) => goalByDay[point.date]?.carbs ?? null),
      fat: points.map((point) => goalByDay[point.date]?.fat ?? null),
    };
    return {
      series: toCaloriesSeries(points),
      points,
      previousPoints: previous.data ?? [],
      dayGoalSets: points.map((point) => goalByDay[point.date] ?? null),
      goals: dayGoals,
      insights: buildNutritionInsights(
        points,
        previous.data ?? [],
        dayGoals,
        macroGoals
      ),
    };
  }, [current.data, previous.data, goals.data, days, startDate]);

  return {
    report,
    isLoading: current.isLoading,
    isError: current.isError,
  };
}
