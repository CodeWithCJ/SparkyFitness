import { useQuery } from '@tanstack/react-query';
import { fetchSuggestedExercises } from '../services/api/exerciseApi';
import { suggestedExercisesQueryKey } from './queryKeys';

// One shared empty list, so a query with no data does not hand callers a new
// array (and a new memo key) on every render.
const NO_EXERCISES: never[] = [];

export function useSuggestedExercises(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: suggestedExercisesQueryKey,
    queryFn: () => fetchSuggestedExercises(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: options?.enabled ?? true,
  });

  return {
    recentExercises: query.data?.recentExercises ?? NO_EXERCISES,
    topExercises: query.data?.topExercises ?? NO_EXERCISES,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
