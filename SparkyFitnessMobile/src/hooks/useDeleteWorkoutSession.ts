import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { deleteWorkoutSession } from '../services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  dailySummaryQueryKey,
  suggestedExercisesQueryKey,
} from './queryKeys';

interface UseDeleteWorkoutSessionOptions {
  sessionId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteWorkoutSession({
  sessionId,
  entryDate,
  onSuccess,
}: UseDeleteWorkoutSessionOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = entryDate.split('T')[0];

  const mutation = useMutation({
    mutationFn: () => deleteWorkoutSession(sessionId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Alert.alert('Failed to delete', 'Please try again.');
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      'Delete Workout?',
      'This workout and all its exercises will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => mutation.mutate(),
        },
      ],
    );
  };

  const invalidateCache = () => {
    queryClient.removeQueries({ queryKey: [...exerciseHistoryQueryKey] });
    queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    queryClient.invalidateQueries({
      queryKey: dailySummaryQueryKey(normalizedDate),
    });
    queryClient.invalidateQueries({
      queryKey: [...suggestedExercisesQueryKey],
    });
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
