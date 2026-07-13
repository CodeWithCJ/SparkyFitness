import { mealKeys } from '@/api/keys/meals';
import {
  createMeal,
  deleteMeal,
  getMealById,
  getMealDeletionImpact,
  getMeals,
  getRecentMeals,
  getTopMeals,
  updateMeal,
} from '@/api/Foods/meals';
import { MealFilter, MealPayload } from '@/types/meal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

export const mealSearchOptions = (filter: MealFilter, term?: string) => ({
  queryKey: mealKeys.filter(filter, term),
  queryFn: () => getMeals(filter, term),
  meta: {
    errorTitle: i18n.t('common.error', 'Error'),
    errorMessage: i18n.t(
      'mealManagement.failedToLoadMeals',
      'Failed to load meals.'
    ),
  },
});

export const useMeals = (filter: MealFilter, term?: string) => {
  return useQuery(mealSearchOptions(filter, term));
};

// Recent + frequent meals for the food-search landing quick-pick list. Recent
// and top come from separate endpoints, so this runs two queries and surfaces
// their combined loading state alongside the parallel recent/top foods.
export const useRecentAndTopMealsQuery = (limit: number, enabled = true) => {
  const { t } = useTranslation();
  const recent = useQuery({
    queryKey: mealKeys.recent(limit),
    queryFn: () => getRecentMeals(limit),
    enabled,
    meta: {
      errorMessage: t(
        'mealManagement.failedToLoadRecentMeals',
        'Failed to load recent meals.'
      ),
    },
  });
  const top = useQuery({
    queryKey: mealKeys.top(limit),
    queryFn: () => getTopMeals(limit),
    enabled,
    meta: {
      errorMessage: t(
        'mealManagement.failedToLoadTopMeals',
        'Failed to load top meals.'
      ),
    },
  });
  return {
    recentMeals: recent.data ?? [],
    topMeals: top.data ?? [],
    // isLoading (initial fetch only), not isFetching, so background refetches
    // do not flash the landing spinner / thrash the layout. Guard with enabled
    // as a belt-and-suspenders: on v5 a disabled query already reports
    // isLoading=false, but this stays correct if that ever changes.
    isLoading: enabled && (recent.isLoading || top.isLoading),
  };
};

export const mealDeletionImpactOptions = (mealId: string) => ({
  queryKey: mealKeys.impact(mealId),
  queryFn: () => getMealDeletionImpact(mealId),
  staleTime: 1000 * 10,
  enabled: !!mealId,
  meta: {
    errorMessage: i18n.t(
      'mealManagement.failedToLoadDeletionImpact',
      'Failed to load meal deletion impact.'
    ),
  },
});
export const mealViewOptions = (mealId?: string) => ({
  queryKey: mealKeys.one(mealId),
  queryFn: () => getMealById(mealId!),
  staleTime: 1000 * 10,
  enabled: !!mealId,
  meta: {
    errorMessage: i18n.t(
      'mealManagement.failedToLoadMealDetails',
      'Failed to load meal details.'
    ),
  },
});

export const useMeal = (mealId?: string, enabled = true) => {
  return useQuery({ ...mealViewOptions(mealId), enabled: enabled && !!mealId });
};

export const useDeleteMealMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
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
    meta: {
      errorMessage: t(
        'mealManagement.failedToDeleteMeal',
        'Failed to delete meal.'
      ),
      successMessage: t(
        'mealManagement.mealDeletedSuccessfully',
        'Meal deleted successfully.'
      ),
    },
  });
};
export const useUpdateMealMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
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
    meta: {
      errorMessage: t(
        'mealManagement.failedToUpdateMeal',
        'Failed to update meal.'
      ),
      successMessage: t(
        'mealManagement.mealUpdatedSuccessfully',
        'Meal updated successfully.'
      ),
    },
  });
};
export const useCreateMealMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ mealPayload }: { mealPayload: MealPayload }) =>
      createMeal(mealPayload),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'mealManagement.failedToCreateMeal',
        'Failed to create meal.'
      ),
      successMessage: t(
        'mealManagement.mealCreatedSuccessfully',
        'Meal created successfully.'
      ),
    },
  });
};
