import { useMemo } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { searchOpenFoodFacts, searchUsda, searchFatSecret, searchMealie } from '../services/api/externalFoodSearchApi';
import { externalFoodSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { RateLimiter } from '../utils/rateLimiter';

const SUPPORTED_PROVIDERS = new Set(['openfoodfacts', 'usda', 'fatsecret', 'mealie']);

// Open Food Facts allows 10 req/min; use 8 for headroom
const offRateLimiter = new RateLimiter(8, 60_000);

export function useExternalFoodSearch(
  searchText: string,
  providerType: string,
  options?: { enabled?: boolean; providerId?: string },
) {
  const { enabled = true, providerId } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 600);
  const isSearchActive = debouncedSearch.length >= 3;
  const isProviderSupported = SUPPORTED_PROVIDERS.has(providerType);

  const query = useInfiniteQuery({
    queryKey: externalFoodSearchQueryKey(providerType, debouncedSearch, providerId),
    queryFn: async ({ signal, pageParam }) => {
      switch (providerType) {
        case 'openfoodfacts':
          await offRateLimiter.acquire(signal);
          return searchOpenFoodFacts(debouncedSearch, pageParam);
        case 'usda':
          if (!providerId) return { items: [], pagination: { page: 1, pageSize: 0, totalCount: 0, hasMore: false } };
          return searchUsda(debouncedSearch, providerId, pageParam);
        case 'fatsecret':
          if (!providerId) return { items: [], pagination: { page: 1, pageSize: 0, totalCount: 0, hasMore: false } };
          return searchFatSecret(debouncedSearch, providerId, pageParam);
        case 'mealie':
          if (!providerId) return { items: [], pagination: { page: 1, pageSize: 0, totalCount: 0, hasMore: false } };
          return searchMealie(debouncedSearch, providerId, pageParam);
        default:
          return { items: [], pagination: { page: 1, pageSize: 0, totalCount: 0, hasMore: false } };
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: isSearchActive && isProviderSupported && enabled,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  const searchResults = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data?.pages],
  );
  // When keepPreviousData is active, isPlaceholderData is true and data belongs
  // to the previous query key. Only treat the error as a load-more error when
  // the current query has real (non-placeholder) pages loaded.
  const hasCurrentData = !query.isPlaceholderData && (query.data?.pages.length ?? 0) > 0;

  return {
    searchResults,
    isSearching: query.isFetching && !query.isFetchingNextPage,
    isSearchActive,
    isSearchError: query.isError && !hasCurrentData,
    isProviderSupported,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isError && hasCurrentData,
  };
}
