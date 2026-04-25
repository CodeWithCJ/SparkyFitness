import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { createMeal, fetchMeals } from '../services/api/mealsApi';
import { mealsQueryKey } from './queryKeys';
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
