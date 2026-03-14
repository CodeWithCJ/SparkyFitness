import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchWorkoutPresets } from '../services/api/workoutPresetsApi';
import { workoutPresetSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

export function useWorkoutPresetSearch(searchText: string, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const isSearchActive = debouncedSearch.length >= 2;

  const query = useQuery({
    queryKey: workoutPresetSearchQueryKey(debouncedSearch),
    queryFn: () => searchWorkoutPresets(debouncedSearch),
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
