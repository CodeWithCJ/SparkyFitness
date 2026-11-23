import type { QueryClient } from '@tanstack/react-query';
import {
  glucoseContextQueryKeyRoot,
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  exerciseStatsQueryKeyRoot,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
  workoutSessionQueryKeyRoot,
  workoutLocationsQueryKey,
  trainingCalendarRootQueryKey,
  trainingLoadRootQueryKey,
  fitnessFatigueRootQueryKey,
} from './queryKeys';

export function invalidateExerciseCache(
  queryClient: QueryClient,
  entryDate: string
) {
  void queryClient.invalidateQueries({ queryKey: glucoseContextQueryKeyRoot });
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
  // A cardio session read from the list or already open (distance, stride,
  // effort, pace series) and the trends built from the same entries.
  void queryClient.invalidateQueries({ queryKey: ['cardioSessionDetail'] });
  void queryClient.invalidateQueries({ queryKey: ['cardioSessions'] });
  void queryClient.invalidateQueries({
    queryKey: ['activeWorkoutPlan'],
  });
  void queryClient.invalidateQueries({
    queryKey: ['workoutPlanTemplates'],
  });
  // Load, readiness and the plan calendar are all worked out from the diary's
  // workouts, so a saved, edited or deleted workout changes every one of them.
  for (const queryKey of [
    trainingLoadRootQueryKey,
    fitnessFatigueRootQueryKey,
    trainingCalendarRootQueryKey,
  ]) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
