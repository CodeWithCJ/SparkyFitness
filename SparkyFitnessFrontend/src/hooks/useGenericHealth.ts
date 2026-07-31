import { useQuery } from '@tanstack/react-query';
import * as genericHealthService from '@/api/Health/genericHealthService';

export const genericHealthKeys = {
  metrics: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-metrics', startDate, endDate, userId] as const,
  heartRate: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-heart-rate', startDate, endDate, userId] as const,
  hrv: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-hrv', startDate, endDate, userId] as const,
  respiration: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-respiration', startDate, endDate, userId] as const,
  spo2: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-spo2', startDate, endDate, userId] as const,
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

export const useHeartRateEntries = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.heartRate(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchHeartRateEntries(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load heart rate telemetry.' },
  });

export const useHrvEntries = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.hrv(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchHrvEntries(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load HRV telemetry.' },
  });

export const useRespirationEntries = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.respiration(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchRespirationEntries(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load respiration telemetry.' },
  });

export const useSpo2Entries = (
  startDate: string,
  endDate?: string,
  userId?: string
) =>
  useQuery({
    queryKey: genericHealthKeys.spo2(startDate, endDate, userId),
    queryFn: () =>
      genericHealthService.fetchSpo2Entries(startDate, endDate, userId),
    enabled: Boolean(startDate),
    meta: { errorMessage: 'Failed to load SpO2 telemetry.' },
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
