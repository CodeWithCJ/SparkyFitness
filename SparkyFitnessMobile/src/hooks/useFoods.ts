import { useQuery } from '@tanstack/react-query';
import { fetchFoods } from '../services/api/foodsApi';
import { foodsQueryKey } from './queryKeys';

export function useFoods(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: foodsQueryKey,
    queryFn: fetchFoods,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    recentFoods: query.data?.recentFoods ?? [],
    topFoods: query.data?.topFoods ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
