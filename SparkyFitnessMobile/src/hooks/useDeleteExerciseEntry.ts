import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { deleteExerciseEntry } from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';

interface UseDeleteExerciseEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteExerciseEntry({
  entryId,
  entryDate,
  onSuccess,
}: UseDeleteExerciseEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = entryDate.split('T')[0];

  const mutation = useMutation({
    mutationFn: () => deleteExerciseEntry(entryId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Alert.alert('Failed to delete', 'Please try again.');
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      'Delete Activity?',
      'This activity will be permanently removed.',
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
