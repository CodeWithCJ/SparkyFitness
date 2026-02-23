import { useQuery } from '@tanstack/react-query';
import { fetchExternalProviders } from '../services/api/externalProvidersApi';
import { FOOD_PROVIDER_TYPES } from '../types/externalProviders';
import { externalProvidersQueryKey } from './queryKeys';

export function useExternalProviders(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: externalProvidersQueryKey,
    queryFn: fetchExternalProviders,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
    select: (data) =>
      data.filter(
        (p) => p.is_active && FOOD_PROVIDER_TYPES.has(p.provider_type),
      ),
  });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
