import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { createWorkout } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import type { CreatePresetSessionRequest } from '@workspace/shared';

export function useCreateWorkout() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreatePresetSessionRequest) => createWorkout(payload),
    onError: () => {
      Alert.alert('Failed to save workout', 'Please try again.');
    },
  });

  return {
    createSession: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache: (entryDate: string) => invalidateExerciseCache(queryClient, entryDate),
  };
}
