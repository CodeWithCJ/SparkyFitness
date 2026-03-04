import { useQuery } from '@tanstack/react-query';
import { fetchFoodVariants } from '../services/api/foodsApi';
import { foodVariantsQueryKey } from './queryKeys';

export function useFoodVariants(foodId: string, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: foodVariantsQueryKey(foodId),
    queryFn: () => fetchFoodVariants(foodId),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    variants: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
