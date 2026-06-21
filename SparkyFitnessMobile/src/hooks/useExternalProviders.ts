import { useQuery } from '@tanstack/react-query';
import { fetchExternalProviders } from '../services/api/externalProvidersApi';
import { externalProvidersQueryKey } from './queryKeys';

export function useExternalProviders(options?: {
  enabled?: boolean;
  category?: 'food' | 'exercise' | 'other';
  supportsBarcode?: boolean;
  filterSet?: Set<string>;
}) {
  const { enabled = true, category = 'food', supportsBarcode, filterSet } = options ?? {};

  const query = useQuery({
    queryKey: externalProvidersQueryKey,
    queryFn: fetchExternalProviders,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
    select: (data) =>
      data.filter((p) => {
        if (!p.is_active) return false;

        // If filterSet is explicitly provided, respect it (legacy/fallback support)
        if (filterSet) {
          return filterSet.has(p.provider_type);
        }

        // Filter by category
        if (category) {
          const cats = p.categories ?? [];
          if (!cats.includes(category)) {
            return false;
          }
        }

        // Filter by barcode support
        if (supportsBarcode) {
          if (!p.supports_barcode) return false;
        }

        return true;
      }),
  });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
