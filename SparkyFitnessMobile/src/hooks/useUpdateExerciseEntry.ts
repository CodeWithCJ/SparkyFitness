import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateExerciseEntry, type CreateExerciseEntryPayload } from '../services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';

export function useUpdateExerciseEntry() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateExerciseEntryPayload }) =>
      updateExerciseEntry(id, payload),
    onError: () => {
      Alert.alert('Failed to update activity', 'Please try again.');
    },
  });

  const invalidateCache = (entryDate: string) => {
    queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
    queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
  };

  return {
    updateEntry: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
