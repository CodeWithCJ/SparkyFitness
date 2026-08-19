import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { ImageUploadArgs } from '../utils/pickerImages';
import {
  createMeal,
  deleteMeal,
  fetchMeal,
  fetchMealDeletionImpact,
  fetchMeals,
  fetchRecentMeals,
  fetchTopMeals,
  updateMeal,
} from '../services/api/mealsApi';
import {
  favoritesQueryKey,
  mealDetailQueryKey,
  mealSearchQueryKeyRoot,
  mealsQueryKey,
  recentMealsQueryKey,
  recentMealsQueryKeyRoot,
  topMealsQueryKey,
  topMealsQueryKeyRoot,
} from './queryKeys';
import type { QueryClient } from '@tanstack/react-query';
import type { CreateMealPayload, Meal, UpdateMealPayload } from '../types/meals';

// Stable reference for the "no data yet" case. A fresh `[]` on every render
// would break memoization for consumers (e.g. the landing-list useMemo in
// FoodSearchScreen) while a query is still loading.
const EMPTY_MEALS: Meal[] = [];

/**
 * Invalidates the caches derived from meal *usage* (recency and frequency).
 * Call this from any mutation that logs, edits or removes a meal entry: both
 * lists feed the food-search landing, so refreshing one without the other
 * leaves the landing internally inconsistent.
 */
export function invalidateMealUsageCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: recentMealsQueryKeyRoot, refetchType: 'all' });
  queryClient.invalidateQueries({ queryKey: topMealsQueryKeyRoot, refetchType: 'all' });
}

function invalidateMealCaches(queryClient: QueryClient, mealId?: string) {
  queryClient.invalidateQueries({ queryKey: mealsQueryKey });
  invalidateMealUsageCaches(queryClient);
  queryClient.invalidateQueries({ queryKey: mealSearchQueryKeyRoot });
  // Favorites are a separate query root (5-min staleTime): an edited favorited
  // meal would otherwise show stale content, and a deleted one (cascade-removed
  // server-side) would linger and be re-selectable.
  queryClient.invalidateQueries({ queryKey: favoritesQueryKey });

  if (mealId) {
    queryClient.invalidateQueries({ queryKey: mealDetailQueryKey(mealId) });
  }
}

export function useMeals(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: mealsQueryKey,
    queryFn: fetchMeals,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    meals: query.data ?? EMPTY_MEALS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useRecentMeals(options?: { enabled?: boolean; limit?: number }) {
  const { enabled = true, limit = 3 } = options ?? {};

  const query = useQuery({
    queryKey: recentMealsQueryKey(limit),
    queryFn: () => fetchRecentMeals(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    recentMeals: query.data ?? EMPTY_MEALS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useTopMeals(options?: { enabled?: boolean; limit?: number }) {
  const { enabled = true, limit = 3 } = options ?? {};

  const query = useQuery({
    queryKey: topMealsQueryKey(limit),
    queryFn: () => fetchTopMeals(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    topMeals: query.data ?? EMPTY_MEALS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useMeal(
  mealId: string | undefined,
  options?: { enabled?: boolean; initialMeal?: Meal },
) {
  const { enabled = true, initialMeal } = options ?? {};

  const query = useQuery({
    queryKey: mealDetailQueryKey(mealId ?? ''),
    queryFn: () => fetchMeal(mealId!),
    enabled: enabled && !!mealId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: initialMeal,
  });

  return {
    meal: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export type MealImages = ImageUploadArgs;

type CreateMealVariables = {
  payload: CreateMealPayload;
  images?: MealImages;
};

type UpdateMealVariables = {
  payload: UpdateMealPayload;
  images?: MealImages;
};

export function useCreateMeal() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ payload, images }: CreateMealVariables) =>
      createMeal(payload, images),
    onSuccess: (meal) => {
      invalidateMealCaches(queryClient, meal.id);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('mealMutations.createFailed', { defaultValue: 'Failed to create meal' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  // Images stay an optional trailing argument so callers that never touch
  // photos keep their existing single-argument call.
  return {
    createMeal: (payload: CreateMealPayload, images?: MealImages) =>
      mutation.mutate({ payload, images }),
    createMealAsync: (payload: CreateMealPayload, images?: MealImages) =>
      mutation.mutateAsync({ payload, images }),
    isPending: mutation.isPending,
  };
}

export function useUpdateMeal(options?: { mealId?: string; onSuccess?: (meal: Meal) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mealId, onSuccess } = options ?? {};

  const mutation = useMutation({
    mutationFn: ({ payload, images }: UpdateMealVariables) => {
      if (!mealId) {
        throw new Error('Meal ID is required to update a meal.');
      }
      return updateMeal(mealId, payload, images);
    },
    onSuccess: (meal) => {
      invalidateMealCaches(queryClient, meal.id);
      onSuccess?.(meal);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('mealMutations.updateFailed', { defaultValue: 'Failed to update meal' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  return {
    updateMeal: (payload: UpdateMealPayload, images?: MealImages) =>
      mutation.mutate({ payload, images }),
    updateMealAsync: (payload: UpdateMealPayload, images?: MealImages) =>
      mutation.mutateAsync({ payload, images }),
    isPending: mutation.isPending,
  };
}

export function useDeleteMeal(options: { mealId?: string; onSuccess?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mealId, onSuccess } = options;

  const mutation = useMutation({
    mutationFn: () => {
      if (!mealId) {
        throw new Error('Meal ID is required to delete a meal.');
      }
      return deleteMeal(mealId);
    },
    onSuccess: () => {
      invalidateMealCaches(queryClient, mealId);
      onSuccess?.();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('mealMutations.deleteFailed', { defaultValue: 'Failed to delete meal' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const confirmAndDelete = async () => {
    if (!mealId) return;

    let usage: { usedByCurrentUser: boolean; usedByOtherUsers: boolean } | null = null;
    try {
      usage = await fetchMealDeletionImpact(mealId);
    } catch {
      Alert.alert(
        t('mealMutations.deleteVerificationFailedTitle', { defaultValue: 'Unable to verify deletion' }),
        t('mealMutations.deleteVerificationFailedMessage', { defaultValue: 'We could not verify whether this meal is used elsewhere. Try again before deleting it.' }),
        [{ text: t('common.ok', { defaultValue: 'OK' }), style: 'cancel' }],
      );
      return;
    }

    const hasUsage = usage.usedByCurrentUser || usage.usedByOtherUsers;

    Alert.alert(
      t('mealMutations.deleteTitle', { defaultValue: 'Delete Meal' }),
      hasUsage
        ? t('mealMutations.deleteWithUsage', { defaultValue: 'Delete this meal from your library? Logged diary entries will stay unchanged, but related meal plans may be affected.' })
        : t('mealMutations.deleteWithoutUsage', { defaultValue: 'Delete this meal from your library? Logged diary entries will stay unchanged.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
  };
}
