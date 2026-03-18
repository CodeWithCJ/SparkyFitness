import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';

export function invalidateExerciseCache(queryClient: QueryClient, entryDate: string) {
  void queryClient.invalidateQueries({ queryKey: [...exerciseHistoryQueryKey] });
  queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey], type: 'inactive' });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
  void queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
  void queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
}
