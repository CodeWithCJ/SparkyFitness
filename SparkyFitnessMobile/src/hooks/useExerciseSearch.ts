import { useDebouncedSearch } from './useDebouncedSearch';
import { searchExercises } from '../services/api/exerciseApi';
import { exerciseSearchQueryKey } from './queryKeys';

export function useExerciseSearch(searchText: string) {
  return useDebouncedSearch({
    searchText,
    queryKey: exerciseSearchQueryKey,
    queryFn: searchExercises,
  });
}
