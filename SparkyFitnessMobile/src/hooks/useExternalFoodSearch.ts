import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchOpenFoodFacts, searchUsda, searchFatSecret } from '../services/api/externalFoodSearchApi';
import { externalFoodSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

const SUPPORTED_PROVIDERS = new Set(['openfoodfacts', 'usda', 'fatsecret']);

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
    queryFn: () => {
      switch (providerType) {
        case 'openfoodfacts':
          return searchOpenFoodFacts(debouncedSearch);
        case 'usda':
          if (!providerId) return [];
          return searchUsda(debouncedSearch, providerId);
        case 'fatsecret':
          if (!providerId) return [];
          return searchFatSecret(debouncedSearch, providerId);
        default:
          return Promise.resolve([]);
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
