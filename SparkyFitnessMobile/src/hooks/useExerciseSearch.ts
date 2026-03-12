import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchExercises } from '../services/api/exerciseApi';
import { exerciseSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

export function useExerciseSearch(searchText: string) {
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const isSearchActive = debouncedSearch.length >= 2;

  const query = useQuery({
    queryKey: exerciseSearchQueryKey(debouncedSearch),
    queryFn: () => searchExercises(debouncedSearch),
    enabled: isSearchActive,
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
