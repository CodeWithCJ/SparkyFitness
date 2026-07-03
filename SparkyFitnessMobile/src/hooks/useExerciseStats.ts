import { useQuery } from '@tanstack/react-query';
import { fetchExerciseStats } from '../services/api/exerciseApi';
import { exerciseStatsQueryKey } from './queryKeys';

export function useExerciseStats(exerciseId: string | null | undefined) {
  return useQuery({
    queryKey: exerciseStatsQueryKey(exerciseId ?? ''),
    queryFn: () => fetchExerciseStats(exerciseId!),
    enabled: !!exerciseId,
  });
}
