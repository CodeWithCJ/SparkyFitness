import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
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

export function useCreateMeal() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateMealPayload) => createMeal(payload),
    onSuccess: (meal) => {
      invalidateMealCaches(queryClient, meal.id);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to create meal',
        text2: 'Please try again.',
      });
    },
  });

  return {
    createMeal: mutation.mutate,
    createMealAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useUpdateMeal(options?: { mealId?: string; onSuccess?: (meal: Meal) => void }) {
  const queryClient = useQueryClient();
  const { mealId, onSuccess } = options ?? {};

  const mutation = useMutation({
    mutationFn: (payload: UpdateMealPayload) => {
      if (!mealId) {
        throw new Error('Meal ID is required to update a meal.');
      }
      return updateMeal(mealId, payload);
    },
    onSuccess: (meal) => {
      invalidateMealCaches(queryClient, meal.id);
      onSuccess?.(meal);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to update meal',
        text2: 'Please try again.',
      });
    },
  });

  return {
    updateMeal: mutation.mutate,
    updateMealAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useDeleteMeal(options: { mealId?: string; onSuccess?: () => void }) {
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
        text1: 'Failed to delete meal',
        text2: 'Please try again.',
      });
    },
  });

  const confirmAndDelete = async () => {
    if (!mealId) return;

    let hasUsage = false;
    try {
      const impact = await fetchMealDeletionImpact(mealId);
      hasUsage = impact.usedByCurrentUser || impact.usedByOtherUsers;
    } catch {
      hasUsage = false;
    }

    Alert.alert(
      'Delete Meal',
      hasUsage
        ? 'Delete this meal from your library? Logged diary entries will stay unchanged, but related meal plans may be affected.'
        : 'Delete this meal from your library? Logged diary entries will stay unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
  };
}
