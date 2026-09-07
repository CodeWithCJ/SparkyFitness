import { useQuery } from '@tanstack/react-query';
import * as genericHealthService from '@/api/Health/genericHealthService';

export const genericHealthKeys = {
  metrics: (startDate: string, endDate?: string, userId?: string) =>
    ['generic-health-metrics', startDate, endDate, userId] as const,
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
