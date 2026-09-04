import { useCallback } from 'react';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
} from '../types/healthTrends';
import type { SleepTimelineDay, SleepTimelineSummary } from '../types/sleep';
import {
  useMeasurementsRange,
  type StepsDataPoint,
  type WeightDataPoint,
} from './useMeasurementsRange';
import { useSleepRange } from './useSleepRange';

interface UseHealthTrendsOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
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
  refetch: () => Promise<void>;
}

/**
 * Every series behind the dashboard's Health Trends pager, from one call.
 */
export function useHealthTrends({
  range,
  enabled = true,
}: UseHealthTrendsOptions): HealthTrends {
  const {
    stepsData,
    weightData,
    isLoading: isMeasurementsLoading,
    isError: isMeasurementsError,
    refetch: refetchMeasurements,
  } = useMeasurementsRange({ range, enabled });

  const {
    sleep,
    isLoading: isSleepLoading,
    isError: isSleepError,
    refetch: refetchSleep,
  } = useSleepRange({ range, enabled });

  const refetch = useCallback(async () => {
    await Promise.all([refetchMeasurements(), refetchSleep()]);
  }, [refetchMeasurements, refetchSleep]);

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
    refetch,
  };
}
