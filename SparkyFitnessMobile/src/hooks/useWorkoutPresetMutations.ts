import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
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
        text1: i18n.t('workoutPresetMutations.errors.create', { defaultValue: 'Could not create workout preset' }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
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
    mutationFn: ({ id, payload }: { id: number; payload: WorkoutPresetUpdatePayload }) =>
      updateWorkoutPreset(id, payload),
    onSuccess: () => {
      invalidateWorkoutPresetCaches(queryClient);
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? i18n.t('workoutPresetMutations.errors.editPermission', { defaultValue: "You don't have permission to edit this preset." })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({ type: 'error', text1: i18n.t('workoutPresetMutations.errors.update', { defaultValue: 'Failed to update preset' }), text2: message });
    },
  });

  return {
    updatePresetAsync: mutation.mutateAsync as (args: {
      id: number;
      payload: WorkoutPresetUpdatePayload;
    }) => Promise<WorkoutPreset>,
    isPending: mutation.isPending,
  };
}

interface UseDeleteWorkoutPresetOptions {
  presetId: number;
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
        ? i18n.t('workoutPresetMutations.errors.deletePermission', { defaultValue: "You don't have permission to delete this preset." })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({ type: 'error', text1: i18n.t('workoutPresetMutations.errors.delete', { defaultValue: 'Failed to delete preset' }), text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      i18n.t('workoutPresetMutations.confirm.title', { defaultValue: 'Delete Workout Preset?' }),
      i18n.t('workoutPresetMutations.confirm.message', { defaultValue: 'This preset will be permanently removed from your library.' }),
      [
        { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: i18n.t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
  };
}
