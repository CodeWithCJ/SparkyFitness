import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateExerciseEntry, type CreateExerciseEntryPayload } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';

export function useUpdateExerciseEntry() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateExerciseEntryPayload }) =>
      updateExerciseEntry(id, payload),
    onError: () => {
      Alert.alert('Failed to update activity', 'Please try again.');
    },
  });

  return {
    updateEntry: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache: (entryDate: string) => invalidateExerciseCache(queryClient, entryDate),
  };
}
