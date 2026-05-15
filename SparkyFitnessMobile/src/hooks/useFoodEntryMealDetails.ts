import { useQuery } from '@tanstack/react-query';
import { getFoodEntryMealWithComponents } from '../services/api/foodEntryMealsApi';
import { foodEntryMealDetailQueryKey } from './queryKeys';
import type { FoodEntryMeal } from '../types/foodEntryMeals';

interface UseFoodEntryMealDetailsOptions {
  enabled?: boolean;
  initialMeal?: FoodEntryMeal;
}

export function useFoodEntryMealDetails(
  foodEntryMealId: string | undefined,
  options?: UseFoodEntryMealDetailsOptions,
) {
  const { enabled = true, initialMeal } = options ?? {};

  const query = useQuery({
    queryKey: foodEntryMealDetailQueryKey(foodEntryMealId ?? ''),
    queryFn: () => getFoodEntryMealWithComponents(foodEntryMealId!),
    enabled: enabled && !!foodEntryMealId,
    staleTime: 1000 * 60 * 5,
    placeholderData: initialMeal,
  });

  return {
    meal: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
