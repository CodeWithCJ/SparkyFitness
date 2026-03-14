import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateWorkout } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import type { UpdatePresetSessionRequest } from '@workspace/shared';

export function useUpdateWorkout() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePresetSessionRequest }) =>
      updateWorkout(id, payload),
    onError: () => {
      Alert.alert('Failed to update workout', 'Please try again.');
    },
  });

  return {
    updateSession: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache: (entryDate: string) => invalidateExerciseCache(queryClient, entryDate),
  };
}
