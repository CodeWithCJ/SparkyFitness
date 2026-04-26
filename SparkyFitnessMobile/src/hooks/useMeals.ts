import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { createMeal, fetchMeals, fetchRecentMeals } from '../services/api/mealsApi';
import { mealsQueryKey, recentMealsQueryKey } from './queryKeys';
import type { CreateMealPayload } from '../types/meals';

export function useMeals(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: mealsQueryKey,
    queryFn: fetchMeals,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    meals: query.data ?? [],
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
    recentMeals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCreateMeal() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateMealPayload) => createMeal(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mealsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['mealSearch'] });
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
