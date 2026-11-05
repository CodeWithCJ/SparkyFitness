import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StarterWorkoutPlanCreateRequest,
  StarterWorkoutPlanKey,
} from '@workspace/shared';
import {
  createStarterWorkoutPlan,
  createWorkoutPlan,
  deleteWorkoutPlan,
  fetchStarterWorkoutPlans,
  fetchWorkoutPlans,
  updateWorkoutPlan,
} from '../services/api/workoutPlansApi';
import type {
  SaveWorkoutPlanPayload,
  WorkoutPlanTemplate,
} from '../types/workoutPlans';
import {
  dailySummaryRootQueryKey,
  starterWorkoutPlansQueryKey,
  workoutPlansQueryKey,
  workoutPlansRootQueryKey,
  workoutPresetsQueryKey,
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

/**
 * Built-in starter plans. An older server has none (the request errors), and
 * the list is then empty so the section stays hidden instead of failing.
 */
export function useStarterWorkoutPlans(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: starterWorkoutPlansQueryKey,
    queryFn: fetchStarterWorkoutPlans,
    enabled: options?.enabled ?? true,
    staleTime: Infinity,
    retry: false,
  });
  return { starterPlans: query.isError ? [] : (query.data ?? []) };
}

export function useAddStarterWorkoutPlan() {
  const invalidate = useInvalidateWorkoutPlans();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({
      key,
      body,
    }: {
      key: StarterWorkoutPlanKey;
      body: StarterWorkoutPlanCreateRequest;
    }) => createStarterWorkoutPlan(key, body),
    onSuccess: () => {
      invalidate();
      // The plan's sessions are new presets.
      void queryClient.invalidateQueries({ queryKey: workoutPresetsQueryKey });
    },
  });
  return {
    addStarterPlanAsync: mutation.mutateAsync,
    pendingKey: mutation.isPending ? mutation.variables?.key : undefined,
  };
}
