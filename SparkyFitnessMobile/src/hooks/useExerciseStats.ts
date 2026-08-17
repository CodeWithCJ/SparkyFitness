import { useQuery } from '@tanstack/react-query';
import { fetchExerciseStats } from '../services/api/exerciseApi';
import { exerciseStatsQueryKey } from './queryKeys';

export function useExerciseStats(
  exerciseId: string | null | undefined,
  excludePresetEntryId?: string,
  presetId?: number,
) {
  return useQuery({
    queryKey: exerciseStatsQueryKey(exerciseId ?? '', excludePresetEntryId, presetId),
    queryFn: () => fetchExerciseStats(exerciseId!, excludePresetEntryId, presetId),
    enabled: !!exerciseId,
  });
}
