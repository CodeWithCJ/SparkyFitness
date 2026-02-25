import { useQuery } from '@tanstack/react-query';
import { fetchMeals } from '../services/api/mealsApi';
import { mealsQueryKey } from './queryKeys';

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
