import { useQuery } from '@tanstack/react-query';
import { fetchFavorites } from '../services/api/favoritesApi';
import { favoritesQueryKey } from './queryKeys';

export function useFavorites(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: favoritesQueryKey,
    queryFn: fetchFavorites,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    favoriteFoods: query.data?.favoriteFoods ?? [],
    favoriteMeals: query.data?.favoriteMeals ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
