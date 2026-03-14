import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';

export function invalidateExerciseCache(queryClient: QueryClient, entryDate: string) {
  queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
  queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
  queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
}
