import { useQuery } from '@tanstack/react-query';
import { fetchSuggestedExercises } from '../services/api/exerciseApi';
import { suggestedExercisesQueryKey } from './queryKeys';

export function useSuggestedExercises() {
  const query = useQuery({
    queryKey: suggestedExercisesQueryKey,
    queryFn: () => fetchSuggestedExercises(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    recentExercises: query.data?.recentExercises ?? [],
    topExercises: query.data?.topExercises ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
