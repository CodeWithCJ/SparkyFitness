import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { deleteWorkout } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';

interface UseDeleteWorkoutOptions {
  sessionId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteWorkout({
  sessionId,
  entryDate,
  onSuccess,
}: UseDeleteWorkoutOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = entryDate.split('T')[0];

  const mutation = useMutation({
    mutationFn: () => deleteWorkout(sessionId),
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

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
    invalidateCache: () => invalidateExerciseCache(queryClient, normalizedDate),
  };
}
