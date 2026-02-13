import { mealKeys } from '@/api/keys/meals';
import {
  createMeal,
  deleteMeal,
  getMealById,
  getMealDeletionImpact,
  getMeals,
  MealFilter,
  updateMeal,
} from '@/api/Foods/meals';
import { MealPayload } from '@/types/meal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useMeals = (filter: MealFilter) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: mealKeys.filter(filter),
    queryFn: () => getMeals(filter),
    meta: {
      errorTitle: t('common.error', 'Error'),
      errorMessage: t(
        'mealManagement.failedToLoadMeals',
        'Failed to load meals.'
      ),
    },
  });
};

export const mealDeletionImpactOptions = (mealId: string) => ({
  queryKey: mealKeys.impact(mealId),
  queryFn: () => getMealDeletionImpact(mealId),
  staleTime: 1000 * 10,
  enabled: !!mealId,
});
export const mealViewOptions = (mealId: string) => ({
  queryKey: mealKeys.one(mealId),
  queryFn: () => getMealById(mealId),
  staleTime: 1000 * 10,
  enabled: !!mealId,
});

export const useDeleteMealMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mealId,
      force = false,
    }: {
      mealId: string;
      force?: boolean;
    }) => deleteMeal(mealId, force),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
  });
};
export const useUpdateMealMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mealId,
      mealPayload,
    }: {
      mealId: string;
      mealPayload: MealPayload;
    }) => updateMeal(mealId, mealPayload),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
  });
};
export const useCreateMealMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mealPayload }: { mealPayload: MealPayload }) =>
      createMeal(mealPayload),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
  });
};
