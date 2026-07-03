import { useCallback } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { searchExternalFoods } from '../services/api/externalFoodSearchApi';
import { allProvidersFoodSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { offRateLimiter } from '../utils/rateLimiter';
import { ExternalProvider } from '../types/externalProviders';
import {
  ExternalFoodItem,
  PaginatedExternalFoodSearchResult,
} from '../types/externalFoods';

// Stable fallback so a missing refetch does not allocate a new function each
// render (which would break reference stability of the providerResults items).
const noop = () => {};

export interface ProviderSearchResult {
  provider: ExternalProvider;
  items: ExternalFoodItem[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// Fans a single search out across every active food provider in parallel. Each
// provider query is independent, so results stream in as they return and a
// failure in one provider does not block the others (partial results). First
// page only; "show all" deep-links to the single-provider search for full
// pagination.
export function useAllProvidersSearch(
  searchText: string,
  providers: ExternalProvider[],
  options?: { enabled?: boolean; autoScale?: boolean },
) {
  const { enabled = true, autoScale } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 600);
  const isSearchActive = debouncedSearch.length >= 3;

  // Project the raw query results into ProviderSearchResult here, inside
  // useQueries' `combine`, rather than in a downstream useMemo over the raw
  // queries array. Without `combine`, useQueries returns a brand-new array
  // reference on every render (the array is rebuilt via `.map`; structural
  // sharing only applies to the `combine` output), which would invalidate every
  // memo that depends on it on each keystroke. React Query runs `combine` only
  // when a query actually changes and applies replaceEqualDeep structural
  // sharing to its result, so providerResults stays referentially stable across
  // renders without reading or writing refs during render. `combine` is
  // compared by identity, so it is memoised on the providers it closes over;
  // results are index-aligned with `providers` because the query list below is
  // built from the same `providers.map` order.
  const combine = useCallback(
    (
      results: UseQueryResult<PaginatedExternalFoodSearchResult>[],
    ): ProviderSearchResult[] =>
      providers.map((provider, i) => {
        const q = results[i];
        const items = q?.data?.items ?? [];
        return {
          provider,
          items,
          totalCount: q?.data?.pagination?.totalCount ?? 0,
          // Loading while fetching with nothing to show yet — covers the initial
          // load and an error retry (isLoading is false on a retry), but not a
          // background refetch that already has cached results (which would
          // otherwise flash the spinner over good data).
          isLoading: (q?.isFetching ?? false) && items.length === 0,
          isError: q?.isError ?? false,
          refetch: q?.refetch ?? noop,
        };
      }),
    [providers],
  );

  const providerResults = useQueries({
    queries: providers.map((p) => ({
      queryKey: allProvidersFoodSearchQueryKey(
        p.provider_type,
        debouncedSearch,
        p.id,
        autoScale,
      ),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (p.provider_type === 'openfoodfacts') {
          await offRateLimiter.acquire(signal);
        }
        return searchExternalFoods(
          p.provider_type,
          debouncedSearch,
          1,
          p.id,
          autoScale,
        );
      },
      enabled: isSearchActive && enabled,
      staleTime: 1000 * 60 * 5,
    })),
    combine,
  });

  const anyLoading = providerResults.some((r) => r.isLoading);

  return { providerResults, isSearchActive, anyLoading };
}
