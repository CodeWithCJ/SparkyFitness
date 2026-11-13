import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryResetQueryKey,
  glucoseSamplesQueryKeyRoot,
  glucoseContextQueryKeyRoot,
  customMeasurementsRootQueryKey,
  skinTemperatureQueryKeyRoot,
  sleepDayQueryKeyRoot,
  sleepRangeQueryKeyRoot,
  vo2MaxRangeQueryKeyRoot,
  heartRateRangeQueryKeyRoot,
  heartRateReportQueryKeyRoot,
  heartRateSamplesQueryKeyRoot,
  heartRateDaySleepQueryKeyRoot,
} from './queryKeys';

const dailySummaryQueryFamily = ['dailySummary'] as const;
const measurementsQueryFamily = ['measurements'] as const;
const measurementsRangeQueryFamily = ['measurementsRange'] as const;
const exerciseHistoryQueryFamily = ['exerciseHistory'] as const;

export function refreshHealthSyncCache(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: glucoseContextQueryKeyRoot });
  void queryClient.invalidateQueries({ queryKey: glucoseSamplesQueryKeyRoot });
  void queryClient.invalidateQueries({
    queryKey: customMeasurementsRootQueryKey,
  });
  void queryClient.invalidateQueries({ queryKey: dailySummaryQueryFamily });
  void queryClient.invalidateQueries({ queryKey: ['goalsRange'] });
  void queryClient.invalidateQueries({ queryKey: measurementsQueryFamily });
  void queryClient.invalidateQueries({
    queryKey: measurementsRangeQueryFamily,
  });
  // Sleep is uploaded by the same health-sync run. Default staleTime is Infinity,
  // so without this the diary keeps a partial observer payload until a process
  // restart (reload) refetches /api/sleep.
  void queryClient.invalidateQueries({ queryKey: sleepDayQueryKeyRoot });
  void queryClient.invalidateQueries({ queryKey: sleepRangeQueryKeyRoot });
  // Sleeping wrist temperature is written with the night's sleep.
  void queryClient.invalidateQueries({
    queryKey: skinTemperatureQueryKeyRoot,
  });
  // The heart rate report's day timeline reads its own sleep query
  void queryClient.invalidateQueries({
    queryKey: heartRateDaySleepQueryKeyRoot,
  });
  // VO2 max arrives in the same sync as a custom measurement.
  void queryClient.invalidateQueries({ queryKey: vo2MaxRangeQueryKeyRoot });
  // Resting heart rate and recovery arrive in the same sync; the report's
  // previous-period query is not refetched on focus, so refresh both families.
  void queryClient.invalidateQueries({ queryKey: heartRateRangeQueryKeyRoot });
  void queryClient.invalidateQueries({ queryKey: heartRateReportQueryKeyRoot });
  // Raw readings behind the report's range and day timelines and the cardio
  // session heart rate chart
  void queryClient.invalidateQueries({
    queryKey: heartRateSamplesQueryKeyRoot,
  });
  void queryClient.invalidateQueries({
    queryKey: exerciseHistoryQueryFamily,
    refetchType: 'none',
  });

  queryClient.removeQueries({
    queryKey: exerciseHistoryQueryFamily,
    type: 'inactive',
  });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
}
