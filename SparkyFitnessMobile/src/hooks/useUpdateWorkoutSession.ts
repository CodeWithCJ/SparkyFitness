import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateWorkoutSession } from '../services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';
import type { UpdatePresetSessionRequest } from '@workspace/shared';

export function useUpdateWorkoutSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePresetSessionRequest }) =>
      updateWorkoutSession(id, payload),
    onError: () => {
      Alert.alert('Failed to update workout', 'Please try again.');
    },
  });

  const invalidateCache = (entryDate: string) => {
    queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
    queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    queryClient.invalidateQueries({ queryKey: [...suggestedExercisesQueryKey] });
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entryDate) });
  };

  return {
    updateSession: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
