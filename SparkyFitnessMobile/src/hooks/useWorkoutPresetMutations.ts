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
import { mobileT } from '../localization';

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
        text1: mobileT('workoutPresetMutation.createFailed'),
        text2: mobileT('common.retry'),
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
        ? mobileT('workoutPresetMutation.editForbidden')
        : mobileT('common.retry');
      Toast.show({
        type: 'error',
        text1: mobileT('workoutPresetMutation.updateFailed'),
        text2: message,
      });
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
        ? mobileT('workoutPresetMutation.deleteForbidden')
        : mobileT('common.retry');
      Toast.show({
        type: 'error',
        text1: mobileT('workoutPresetMutation.deleteFailed'),
        text2: message,
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      mobileT('workoutPresetMutation.deleteTitle'),
      mobileT('workoutPresetMutation.deleteDescription'),
      [
        { text: mobileT('common.cancel'), style: 'cancel' },
        {
          text: mobileT('common.delete'),
          style: 'destructive',
          onPress: () => mutation.mutate(),
        },
      ],
    );
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
  };
}
