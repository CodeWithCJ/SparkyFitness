import { useQuery } from '@tanstack/react-query';
import * as genericHealthService from '@/api/Health/genericHealthService';
import type { HealthMetric } from '@workspace/shared';

export const genericHealthKeys = {
  metrics: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-metrics', startDate, endDate, userId] as const,
  // `metric` is part of the key itself -- without it, heart_rate/hrv/respiration/
  // spo2 queries would share one cache entry and clobber each other.
  samples: (
    metric: HealthMetric,
    startDate: string,
    endDate?: string,
    userId?: string
  ) => ['generic-health-samples', metric, startDate, endDate, userId] as const,
  vitals: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-vitals', startDate, endDate, userId] as const,
  workoutLaps: (exerciseEntryId: string) =>
    ['generic-health-workout-laps', exerciseEntryId] as const,
  workoutGps: (exerciseEntryId: string) =>
    ['generic-health-workout-gps', exerciseEntryId] as const,
  workoutHrZones: (exerciseEntryId: string) =>
    ['generic-health-workout-hr-zones', exerciseEntryId] as const,
};

export const useDailyHealthMetrics = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.metrics(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchDailyHealthMetrics(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load daily health metrics.' },
  });

/**
 * Replaces the former useHeartRateEntries/useHrvEntries/useRespirationEntries/
 * useSpo2Entries -- all four metrics now live in one table (health_metric_samples).
 */
export const useHealthMetricSamples = (
  metric: HealthMetric,
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.samples(metric, startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchHealthMetricSamples(
        metric,
        startDate,
        endDate,
        userId
      ),
    enabled: Boolean(startDate),
    meta: { errorMessage: `Failed to load ${metric} telemetry.` },
  });

export const useVitalsEntries = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.vitals(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchVitalsEntries(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load vitals entries.' },
  });

export const useWorkoutLaps = (exerciseEntryId: string) =>
  useQuery({
    queryKey: genericHealthKeys.workoutLaps(exerciseEntryId),
    queryFn: () => genericHealthService.fetchWorkoutLaps(exerciseEntryId),
    enabled: Boolean(exerciseEntryId),
    meta: { errorMessage: 'Failed to load workout laps.' },
  });

export const useWorkoutGpsPoints = (exerciseEntryId: string) =>
  useQuery({
    queryKey: genericHealthKeys.workoutGps(exerciseEntryId),
    queryFn: () => genericHealthService.fetchWorkoutGpsPoints(exerciseEntryId),
    enabled: Boolean(exerciseEntryId),
    meta: { errorMessage: 'Failed to load workout GPS points.' },
  });

export const useWorkoutHrZones = (exerciseEntryId: string) =>
  useQuery({
    queryKey: genericHealthKeys.workoutHrZones(exerciseEntryId),
    queryFn: () => genericHealthService.fetchWorkoutHrZones(exerciseEntryId),
    enabled: Boolean(exerciseEntryId),
    meta: { errorMessage: 'Failed to load heart rate zones.' },
  });
