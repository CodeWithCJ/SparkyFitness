import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { createWorkoutSession } from '../services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';
import type { CreatePresetSessionRequest } from '@workspace/shared';

export function useCreateWorkoutSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreatePresetSessionRequest) => createWorkoutSession(payload),
    onError: () => {
      Alert.alert('Failed to save workout', 'Please try again.');
    },
  });

  const invalidateCache = (entryDate: string) => {
    queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
    queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
  };

  return {
    createSession: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
