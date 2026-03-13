import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { createExerciseEntry, type CreateExerciseEntryPayload } from '../services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';

export function useCreateExerciseEntry() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateExerciseEntryPayload) => createExerciseEntry(payload),
    onError: () => {
      Alert.alert('Failed to save activity', 'Please try again.');
    },
  });

  const invalidateCache = (entryDate: string) => {
    queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
    queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
  };

  return {
    createEntry: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
