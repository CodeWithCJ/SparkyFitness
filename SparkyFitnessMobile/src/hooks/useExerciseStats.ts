import { useQuery } from '@tanstack/react-query';
import { fetchExerciseStats } from '../services/api/exerciseApi';
import { exerciseStatsQueryKey } from './queryKeys';

export function useExerciseStats(
  exerciseId: string | null | undefined,
  excludePresetEntryId?: string,
) {
  return useQuery({
    queryKey: exerciseStatsQueryKey(exerciseId ?? '', excludePresetEntryId),
    queryFn: () => fetchExerciseStats(exerciseId!, excludePresetEntryId),
    enabled: !!exerciseId,
  });
}
