import { useQuery } from '@tanstack/react-query';
import { fetchFood, fetchFoods } from '../services/api/foodsApi';
import { foodDetailQueryKey, foodsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** One saved food, e.g. to show its name where only its id is stored. */
export function useFood(
  foodId: string | undefined,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};
  const query = useQuery({
    queryKey: foodDetailQueryKey(foodId ?? ''),
    queryFn: () => fetchFood(foodId!),
    enabled: enabled && !!foodId,
    staleTime: 1000 * 60 * 5,
  });
  return { food: query.data, isLoading: query.isLoading };
}

export function useFoods(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: foodsQueryKey,
    queryFn: fetchFoods,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    recentFoods: query.data?.recentFoods ?? [],
    topFoods: query.data?.topFoods ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
