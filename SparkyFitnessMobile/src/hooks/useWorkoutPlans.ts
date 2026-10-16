import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  fetchWorkoutPlans,
  updateWorkoutPlan,
} from '../services/api/workoutPlansApi';
import type {
  SaveWorkoutPlanPayload,
  WorkoutPlanTemplate,
} from '../types/workoutPlans';
import {
  dailySummaryRootQueryKey,
  workoutPlansQueryKey,
  workoutPlansRootQueryKey,
} from './queryKeys';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { getTodayDate } from '../utils/dateUtils';

const EMPTY_WORKOUT_PLANS: WorkoutPlanTemplate[] = [];

type SaveVariables = {
  payload: SaveWorkoutPlanPayload;
  currentClientDate: string;
};

export function useWorkoutPlans(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: workoutPlansQueryKey,
    queryFn: fetchWorkoutPlans,
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 5,
  });

  return {
    workoutPlans: query.data ?? EMPTY_WORKOUT_PLANS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * A plan drives the list, the plan for each day (the diary banner and the
 * watch's "Scheduled today"), and, in prefill mode, exercise entries the
 * server writes into upcoming days, so all of those are refreshed.
 */
function useInvalidateWorkoutPlans() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: workoutPlansRootQueryKey });
    void queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    invalidateExerciseCache(queryClient, getTodayDate());
  };
}

export function useCreateWorkoutPlan() {
  const invalidate = useInvalidateWorkoutPlans();
  const mutation = useMutation({
    mutationFn: ({ payload, currentClientDate }: SaveVariables) =>
      createWorkoutPlan(payload, currentClientDate),
    onSuccess: invalidate,
  });

  return {
    createWorkoutPlanAsync: (
      payload: SaveWorkoutPlanPayload,
      currentClientDate: string
    ) => mutation.mutateAsync({ payload, currentClientDate }),
    isPending: mutation.isPending,
  };
}

export function useUpdateWorkoutPlan(id: string | undefined) {
  const invalidate = useInvalidateWorkoutPlans();
  const mutation = useMutation({
    mutationFn: ({ payload, currentClientDate }: SaveVariables) => {
      if (!id) throw new Error('Workout plan ID is required to update a plan.');
      return updateWorkoutPlan(id, payload, currentClientDate);
    },
    onSuccess: invalidate,
  });

  return {
    updateWorkoutPlanAsync: (
      payload: SaveWorkoutPlanPayload,
      currentClientDate: string
    ) => mutation.mutateAsync({ payload, currentClientDate }),
    isPending: mutation.isPending,
  };
}

export function useDeleteWorkoutPlan() {
  const invalidate = useInvalidateWorkoutPlans();
  const mutation = useMutation({
    mutationFn: (id: string) => deleteWorkoutPlan(id),
    onSuccess: invalidate,
  });

  return {
    deleteWorkoutPlanAsync: (id: string) => mutation.mutateAsync(id),
    isPending: mutation.isPending,
  };
}
