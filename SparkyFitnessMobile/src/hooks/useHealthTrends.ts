import { useCallback } from 'react';
import type { HealthTrendKey } from '../constants/healthTrends';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
  HydrationDataPoint,
} from '../types/healthTrends';
import type { SleepTimelineDay, SleepTimelineSummary } from '../types/sleep';
import {
  useMeasurementsRange,
  type StepsDataPoint,
  type WeightDataPoint,
} from './useMeasurementsRange';
import { useHydrationRange } from './useHydrationRange';
import { useSleepRange } from './useSleepRange';

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

interface HealthTrends {
  steps: HealthTrendSeries<StepsDataPoint>;
  weight: HealthTrendSeries<WeightDataPoint>;
  sleep: SleepTrendSeries;
  hydration: HealthTrendSeries<HydrationDataPoint>;
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

  const {
    stepsData,
    weightData,
    isLoading: isMeasurementsLoading,
    isError: isMeasurementsError,
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
    isLoading: isHydrationLoading,
    isError: isHydrationError,
    refetch: refetchHydration,
  } = useHydrationRange({ range, enabled: isHydrationEnabled });

  const refetch = useCallback(async () => {
    await Promise.all([
      isMeasurementsEnabled ? refetchMeasurements() : Promise.resolve(),
      isSleepEnabled ? refetchSleep() : Promise.resolve(),
      isHydrationEnabled ? refetchHydration() : Promise.resolve(),
    ]);
  }, [
    isMeasurementsEnabled,
    isSleepEnabled,
    isHydrationEnabled,
    refetchMeasurements,
    refetchSleep,
    refetchHydration,
  ]);

  return {
    // Steps and weight share one request, so they necessarily share its fetch state.
    steps: {
      data: stepsData,
      isLoading: isMeasurementsLoading,
      isError: isMeasurementsError,
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
      isLoading: isHydrationLoading,
      isError: isHydrationError,
    },
    refetch,
  };
}
