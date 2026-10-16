import { useCallback } from 'react';
import type { HealthTrendKey } from '../constants/healthTrends';
import type {
  CaloriesDataPoint,
  HealthTrendDateRange,
  HealthTrendSeries,
  HydrationDataPoint,
  Vo2MaxDataPoint,
} from '../types/healthTrends';
import type { SleepTimelineDay, SleepTimelineSummary } from '../types/sleep';
import {
  useMeasurementsRange,
  type StepsDataPoint,
  type WeightDataPoint,
} from './useMeasurementsRange';
import { useCaloriesRange } from './useCaloriesRange';
import { useHydrationRange } from './useHydrationRange';
import { useSleepRange } from './useSleepRange';
import { useVo2MaxRange } from './useVo2MaxRange';

interface UseHealthTrendsOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
  activeTrends: readonly HealthTrendKey[];
}

/**
 * The sleep page needs more than a series: its headline tiles show window averages, and
 * `nightsWithData` is what decides whether the page appears at all — `data` is padded to
 * one entry per day and so is never empty.
 */
export type SleepTrendSeries = HealthTrendSeries<SleepTimelineDay> &
  Omit<SleepTimelineSummary, 'days'>;

/** The calories page's headline tile shows the window's average, same reasoning as sleep's. */
export type CaloriesTrendSeries = HealthTrendSeries<CaloriesDataPoint> & {
  averageCalories: number | null;
  /** The resolved calorie goal for each day in the window, same order as `data`. */
  calorieGoals: (number | null)[];
};

/** The resolved hydration goal for each day in the window, same order as `data`. */
export type HydrationTrendSeries = HealthTrendSeries<HydrationDataPoint> & {
  hydrationGoals: (number | null)[];
};

/** The resolved steps goal for each day in the window, same order as `data`. */
export type StepsTrendSeries = HealthTrendSeries<StepsDataPoint> & {
  stepsGoals: (number | null)[];
};

interface HealthTrends {
  steps: StepsTrendSeries;
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: SleepTrendSeries;
  hydration: HydrationTrendSeries;
  calories: CaloriesTrendSeries;
  vo2max: HealthTrendSeries<Vo2MaxDataPoint>;
  refetch: () => Promise<void>;
}

/**
 * Every series behind the dashboard's Health Trends pager, from one call.
 */
export function useHealthTrends({
  range,
  enabled = true,
  activeTrends,
}: UseHealthTrendsOptions): HealthTrends {
  const isMeasurementsEnabled =
    enabled &&
    (activeTrends.includes('steps') || activeTrends.includes('weight'));
  const isSleepEnabled = enabled && activeTrends.includes('sleep');
  const isHydrationEnabled = enabled && activeTrends.includes('hydration');
  const isCaloriesEnabled = enabled && activeTrends.includes('calories');
  const isVo2MaxEnabled = enabled && activeTrends.includes('vo2max');

  const {
    stepsData,
    stepsGoals,
    weightData,
    isLoading: isMeasurementsLoading,
    isError: isMeasurementsError,
    isStepsGoalsError,
    refetch: refetchMeasurements,
  } = useMeasurementsRange({ range, enabled: isMeasurementsEnabled });

  const {
    sleep,
    isLoading: isSleepLoading,
    isError: isSleepError,
    refetch: refetchSleep,
  } = useSleepRange({ range, enabled: isSleepEnabled });

  const {
    hydrationData,
    hydrationGoals,
    isLoading: isHydrationLoading,
    isError: isHydrationError,
    refetch: refetchHydration,
  } = useHydrationRange({ range, enabled: isHydrationEnabled });

  const {
    caloriesData,
    averageCalories,
    calorieGoals,
    isLoading: isCaloriesLoading,
    isError: isCaloriesError,
    refetch: refetchCalories,
  } = useCaloriesRange({ range, enabled: isCaloriesEnabled });

  const {
    vo2MaxData,
    isLoading: isVo2MaxLoading,
    isError: isVo2MaxError,
    refetch: refetchVo2Max,
  } = useVo2MaxRange({ range, enabled: isVo2MaxEnabled });

  const refetch = useCallback(async () => {
    await Promise.all([
      isMeasurementsEnabled ? refetchMeasurements() : Promise.resolve(),
      isSleepEnabled ? refetchSleep() : Promise.resolve(),
      isHydrationEnabled ? refetchHydration() : Promise.resolve(),
      isCaloriesEnabled ? refetchCalories() : Promise.resolve(),
      isVo2MaxEnabled ? refetchVo2Max() : Promise.resolve(),
    ]);
  }, [
    isMeasurementsEnabled,
    isSleepEnabled,
    isHydrationEnabled,
    isCaloriesEnabled,
    isVo2MaxEnabled,
    refetchMeasurements,
    refetchSleep,
    refetchHydration,
    refetchCalories,
    refetchVo2Max,
  ]);

  return {
    // Steps and weight share one request, so they necessarily share its fetch state.
    steps: {
      data: stepsData,
      stepsGoals,
      isLoading: isMeasurementsLoading,
      // A failed goals request must not read as "no goal set"; weight is unaffected.
      isError: isMeasurementsError || isStepsGoalsError,
    },
    weight: {
      data: weightData,
      isLoading: isMeasurementsLoading,
      isError: isMeasurementsError,
    },
    sleep: {
      data: sleep.days,
      averageTimeInBedSeconds: sleep.averageTimeInBedSeconds,
      averageTimeAsleepSeconds: sleep.averageTimeAsleepSeconds,
      nightsWithData: sleep.nightsWithData,
      isLoading: isSleepLoading,
      isError: isSleepError,
    },
    hydration: {
      data: hydrationData,
      hydrationGoals,
      isLoading: isHydrationLoading,
      isError: isHydrationError,
    },
    calories: {
      data: caloriesData,
      averageCalories,
      calorieGoals,
      isLoading: isCaloriesLoading,
      isError: isCaloriesError,
    },
    vo2max: {
      data: vo2MaxData,
      isLoading: isVo2MaxLoading,
      isError: isVo2MaxError,
    },
    refetch,
  };
}
