import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMealPlan,
  deleteMealPlan,
  duplicateMealPlan,
  fetchMealPlans,
  updateMealPlan,
} from '../services/api/mealPlansApi';
import type { MealPlanTemplate, SaveMealPlanPayload } from '../types/mealPlans';
import { dailySummaryRootQueryKey, mealPlansQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';

const EMPTY_MEAL_PLANS: MealPlanTemplate[] = [];

type SaveVariables = {
  payload: SaveMealPlanPayload;
  currentClientDate: string;
};

type IdVariables = {
  id: string;
  currentClientDate: string;
};

export function useMealPlans(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: mealPlansQueryKey,
    queryFn: fetchMealPlans,
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 5,
  });

  return {
    mealPlans: query.data ?? EMPTY_MEAL_PLANS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

function useInvalidateMealPlans() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: mealPlansQueryKey });
    queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    invalidateMealUsageCaches(queryClient);
  };
}

export function useCreateMealPlan() {
  const invalidate = useInvalidateMealPlans();
  const mutation = useMutation({
    mutationFn: ({ payload, currentClientDate }: SaveVariables) =>
      createMealPlan(payload, currentClientDate),
    onSuccess: invalidate,
  });

  return {
    createMealPlanAsync: (
      payload: SaveMealPlanPayload,
      currentClientDate: string
    ) => mutation.mutateAsync({ payload, currentClientDate }),
    isPending: mutation.isPending,
  };
}

export function useUpdateMealPlan(id: string | undefined) {
  const invalidate = useInvalidateMealPlans();
  const mutation = useMutation({
    mutationFn: ({ payload, currentClientDate }: SaveVariables) => {
      if (!id) throw new Error('Meal plan ID is required to update a plan.');
      return updateMealPlan(id, payload, currentClientDate);
    },
    onSuccess: invalidate,
  });

  return {
    updateMealPlanAsync: (
      payload: SaveMealPlanPayload,
      currentClientDate: string
    ) => mutation.mutateAsync({ payload, currentClientDate }),
    isPending: mutation.isPending,
  };
}

export function useDuplicateMealPlan() {
  const invalidate = useInvalidateMealPlans();
  const mutation = useMutation({
    mutationFn: ({ id, currentClientDate }: IdVariables) =>
      duplicateMealPlan(id, currentClientDate),
    onSuccess: invalidate,
  });

  return {
    duplicateMealPlanAsync: (id: string, currentClientDate: string) =>
      mutation.mutateAsync({ id, currentClientDate }),
    isPending: mutation.isPending,
  };
}

export function useDeleteMealPlan() {
  const invalidate = useInvalidateMealPlans();
  const mutation = useMutation({
    mutationFn: ({ id, currentClientDate }: IdVariables) =>
      deleteMealPlan(id, currentClientDate),
    onSuccess: invalidate,
  });

  return {
    deleteMealPlanAsync: (id: string, currentClientDate: string) =>
      mutation.mutateAsync({ id, currentClientDate }),
    isPending: mutation.isPending,
  };
}
