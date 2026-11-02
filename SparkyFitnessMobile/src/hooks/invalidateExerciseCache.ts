import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  exerciseStatsQueryKeyRoot,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
  workoutSessionQueryKeyRoot,
  workoutLocationsQueryKey,
} from './queryKeys';

export function invalidateExerciseCache(
  queryClient: QueryClient,
  entryDate: string
) {
  void queryClient.invalidateQueries({
    queryKey: [...workoutLocationsQueryKey],
  });
  void queryClient.invalidateQueries({
    queryKey: [...exerciseHistoryQueryKey],
  });
  queryClient.removeQueries({
    queryKey: [...exerciseHistoryQueryKey],
    type: 'inactive',
  });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
  void queryClient.invalidateQueries({
    queryKey: [...suggestedExercisesQueryKey],
  });
  void queryClient.invalidateQueries({
    queryKey: [...exerciseStatsQueryKeyRoot],
  });
  void queryClient.invalidateQueries({
    queryKey: dailySummaryQueryKey(entryDate),
  });
  void queryClient.invalidateQueries({ queryKey: ['goalsRange'] });
  // Every cached single-session read, by prefix. Watch telemetry lands on an
  // entry AFTER the workout is saved, so a screen already showing that session
  // — the completion summary most of all, which opens the moment a workout
  // ends — holds a copy with no heart rate in it. Without this the figures
  // appear only on a later visit, which reads as them not working at all.
  void queryClient.invalidateQueries({
    queryKey: [...workoutSessionQueryKeyRoot],
  });
  void queryClient.invalidateQueries({
    queryKey: ['activeWorkoutPlan'],
  });
  void queryClient.invalidateQueries({
    queryKey: ['workoutPlanTemplates'],
  });
}
