import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchOpenFoodFacts, searchUsda, searchFatSecret } from '../services/api/externalFoodSearchApi';
import { externalFoodSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { RateLimiter } from '../utils/rateLimiter';

const SUPPORTED_PROVIDERS = new Set(['openfoodfacts', 'usda', 'fatsecret']);

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

  const query = useQuery({
    queryKey: externalFoodSearchQueryKey(providerType, debouncedSearch, providerId),
    queryFn: async ({ signal }) => {
      switch (providerType) {
        case 'openfoodfacts':
          await offRateLimiter.acquire(signal);
          return searchOpenFoodFacts(debouncedSearch);
        case 'usda':
          if (!providerId) return [];
          return searchUsda(debouncedSearch, providerId);
        case 'fatsecret':
          if (!providerId) return [];
          return searchFatSecret(debouncedSearch, providerId);
        default:
          return [];
      }
    },
    enabled: isSearchActive && isProviderSupported && enabled,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  return {
    searchResults: query.data ?? [],
    isSearching: query.isFetching,
    isSearchActive,
    isSearchError: query.isError,
    isProviderSupported,
  };
}
