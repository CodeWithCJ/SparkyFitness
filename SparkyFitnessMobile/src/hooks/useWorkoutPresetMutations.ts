import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
  type WorkoutPresetCreatePayload,
  type WorkoutPresetUpdatePayload,
} from '../services/api/workoutPresetsApi';
import { workoutPresetsQueryKey } from './queryKeys';
import type { WorkoutPreset } from '../types/workoutPresets';

const isAuthzError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes('403') || error.message.includes('404');
};

function invalidateWorkoutPresetCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: workoutPresetsQueryKey });
  void qc.invalidateQueries({ queryKey: ['workoutPresets', 'count'] });
  void qc.resetQueries({ queryKey: ['workoutPresetsLibraryList'] });
  void qc.invalidateQueries({ queryKey: ['workoutPresetsLibrary'] });
  void qc.invalidateQueries({ queryKey: ['workoutPresetSearch'] });
}

export function useCreateWorkoutPreset() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: WorkoutPresetCreatePayload) => createWorkoutPreset(body),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Could not create workout preset',
        text2: 'Please try again.',
      });
    },
  });

  return {
    createPresetAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useUpdateWorkoutPreset() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: WorkoutPresetUpdatePayload }) =>
      updateWorkoutPreset(id, payload),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? "You don't have permission to edit this preset."
        : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Failed to update preset', text2: message });
    },
  });

  return {
    updatePresetAsync: mutation.mutateAsync as (args: {
      id: string;
      payload: WorkoutPresetUpdatePayload;
    }) => Promise<WorkoutPreset>,
    isPending: mutation.isPending,
  };
}

interface UseDeleteWorkoutPresetOptions {
  presetId: string;
  onSuccess?: () => void;
}

export function useDeleteWorkoutPreset({ presetId, onSuccess }: UseDeleteWorkoutPresetOptions) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteWorkoutPreset(presetId),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
      onSuccess?.();
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? "You don't have permission to delete this preset."
        : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Failed to delete preset', text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      'Delete Workout Preset?',
      'This preset will be permanently removed from your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
  };
}
