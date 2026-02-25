import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchMeals } from '../services/api/mealsApi';
import { mealSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

export function useMealSearch(searchText: string, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const isSearchActive = debouncedSearch.length >= 2;

  const query = useQuery({
    queryKey: mealSearchQueryKey(debouncedSearch),
    queryFn: () => searchMeals(debouncedSearch),
    enabled: isSearchActive && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: keepPreviousData,
  });

  return {
    searchResults: query.data ?? [],
    isSearching: query.isFetching,
    isSearchActive,
    isSearchError: query.isError,
  };
}
