import { useDebouncedSearch } from './useDebouncedSearch';
import { searchWorkoutPresets } from '../services/api/workoutPresetsApi';
import { workoutPresetSearchQueryKey } from './queryKeys';

export function useWorkoutPresetSearch(searchText: string, options?: { enabled?: boolean }) {
  return useDebouncedSearch({
    searchText,
    queryKey: workoutPresetSearchQueryKey,
    queryFn: searchWorkoutPresets,
    enabled: options?.enabled,
  });
}
