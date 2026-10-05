import { loadDailySummaryRange } from '@/api/Diary/dailySummaryService';
import { fetchCustomEntries } from '@/api/CheckIn/checkInService';
import { checkInKeys } from '@/api/keys/checkin';
import { reportKeys } from '@/api/keys/reports';
import {
  getExerciseDashboardData,
  getTrainingConsistency,
  getAlcoholWeekReport,
  getHydrationNutritionRange,
  getWorkoutDays,
  loadReportsData,
} from '@/api/Reports/reportsService';
import { parseStressMeasurement } from '@/utils/reportUtil';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCustomCategories } from '../CheckIn/useCheckIn';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

export const useRawStressData = (userId?: string | null) => {
  const { data: categories } = useCustomCategories(userId);
  const { t } = useTranslation();
  const categoryId = categories?.find(
    (cat) => cat.name === 'Raw Stress Data'
  )?.id;

  return useQuery({
    queryKey: checkInKeys.rawStressData(userId!, categoryId!),
    queryFn: async () => {
      const customMeasurements = await fetchCustomEntries(
        categoryId as string,
        userId!
      );
      let allStressDataPoints: ReturnType<typeof parseStressMeasurement> = [];

      customMeasurements.forEach((measurement: { value: string | number }) => {
        const parsedPoints = parseStressMeasurement(measurement.value);
        if (parsedPoints.length === 0)
          console.error('Error parsing stress values.');
        allStressDataPoints = allStressDataPoints.concat(parsedPoints);
      });

      return allStressDataPoints;
    },
    enabled: !!categoryId && !!userId,
    meta: {
      errorMessage: t(
        'reports.failedToLoadStress',
        'Failed to load stress data.'
      ),
    },
  });
};

export const useReportsData = (
  startDate: string,
  endDate: string,
  userId: string | null,
  enabled: boolean = true
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reportKeys.core(startDate, endDate, userId!),
    queryFn: () => loadReportsData(startDate, endDate, userId!),
    enabled: Boolean(startDate && endDate) && !!userId && enabled,
    meta: {
      errorMessage: t(
        'reports.failedToLoadCoreData',
        'Failed to load core reports data.'
      ),
    },
  });
};

/**
 * Per-day calorie balance for the report window, keyed by date.
 *
 * The Reports page consumes this rather than recomputing the balance from raw exercise
 * entries, so it agrees with the Diary by construction instead of by convention. See
 * issue #2094 for what the browser-side derivation got wrong.
 */
export const useCalorieBalanceRange = (
  startDate: string,
  endDate: string,
  userId: string | null,
  enabled: boolean = true
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reportKeys.calorieBalance(startDate, endDate, userId!),
    queryFn: () => loadDailySummaryRange(startDate, endDate, userId!),
    enabled: Boolean(startDate && endDate) && !!userId && enabled,
    select: (data): Record<string, DailyCalorieBalanceRow> =>
      Object.fromEntries(data.days.map((day) => [day.date, day])),
    meta: {
      errorMessage: t(
        'reports.failedToLoadCalorieBalance',
        'Failed to load calorie balance data.'
      ),
    },
  });
};

export const useExerciseDashboardData = (
  startDate: string,
  endDate: string,
  userId?: string | null,
  equipment: string | null = null,
  muscle: string | null = null,
  exercise: string | null = null
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: reportKeys.exerciseDashboard(
      startDate,
      endDate,
      userId!,
      equipment,
      muscle,
      exercise
    ),
    queryFn: () =>
      getExerciseDashboardData(
        startDate,
        endDate,
        userId!,
        equipment,
        muscle,
        exercise
      ),
    enabled: Boolean(startDate && endDate) && !!userId,
    meta: {
      errorMessage: t(
        'reports.failedToLoadExerciseDashboard',
        'Failed to load exercise dashboard data.'
      ),
    },
  });
};

export const useTrainingConsistency = (userId?: string | null) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: reportKeys.trainingConsistency(userId ?? undefined),
    queryFn: () => getTrainingConsistency(userId ?? undefined),
    enabled: !!userId,
    meta: {
      errorMessage: t(
        'trainingConsistency.loadFailed',
        'Failed to load training consistency.'
      ),
    },
  });
};

export const useAlcoholWeekReport = (
  date: string,
  userId?: string | null,
  enabled: boolean = true
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: reportKeys.alcoholWeek(date, userId ?? undefined),
    queryFn: () => getAlcoholWeekReport(date, userId ?? undefined),
    enabled: Boolean(date) && enabled,
    meta: {
      errorMessage: t(
        'reports.failedToLoadAlcoholWeek',
        'Failed to load weekly alcohol data.'
      ),
    },
  });
};

// #2348: water_ml is deliberately absent from the RANGE_COLS-driven nutrition
// data (design-decisions correction 3), so Trends needs its own range query
// for the bespoke hydration chart. Caffeine/alcohol already ride the existing
// nutritionData prop via NutritionChartsGrid.
/**
 * Per-day workout counts for the heatmap. Fetched on its own fixed window so
 * the heatmap shows the last 12 months regardless of the report's date filter,
 * without loading 12 months of the heavy exercise dashboard (#2461).
 */
export const useWorkoutDays = (
  startDate: string,
  endDate: string,
  userId?: string | null
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: reportKeys.workoutDays(startDate, endDate, userId ?? undefined),
    queryFn: () => getWorkoutDays(startDate, endDate, userId ?? undefined),
    enabled: Boolean(startDate) && Boolean(endDate),
    meta: {
      errorMessage: t(
        'reports.failedToLoadWorkoutHeatmap',
        'Failed to load workout heatmap data.'
      ),
    },
  });
};

export const useHydrationNutritionRange = (
  startDate: string,
  endDate: string,
  userId?: string | null,
  enabled: boolean = true
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: reportKeys.hydrationNutritionRange(
      startDate,
      endDate,
      userId ?? undefined
    ),
    queryFn: () =>
      getHydrationNutritionRange(startDate, endDate, userId ?? undefined),
    enabled: Boolean(startDate) && Boolean(endDate) && enabled,
    meta: {
      errorMessage: t(
        'reports.failedToLoadHydrationTrend',
        'Failed to load hydration trend data.'
      ),
    },
  });
};
