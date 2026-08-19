import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import type { CreatePresetSessionRequest, UpdatePresetSessionRequest } from '@workspace/shared';
import {
  createWorkout,
  updateWorkout,
  deleteWorkout as deleteWorkoutApi,
  createExerciseEntry,
  updateExerciseEntry,
  deleteExerciseEntry as deleteExerciseEntryApi,
  createExercise,
  updateExercise,
  deleteExerciseFromLibrary,
  type CreateExerciseEntryPayload,
  type UpdateExercisePayload,
} from '../services/api/exerciseApi';
import { normalizeDate } from '../utils/dateUtils';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { syncExerciseSessionInCache } from './syncExerciseSessionInCache';
import { suggestedExercisesQueryKey } from './queryKeys';

// Library/catalog mutations don't have an `entryDate`, so they cannot reuse
// `invalidateExerciseCache` (which is keyed to a date). Use this helper to
// invalidate the library/search/recents/count caches after create/update/delete.
function invalidateExerciseLibraryCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
  void qc.invalidateQueries({ queryKey: ['exercises', 'count'] });
  void qc.resetQueries({ queryKey: ['exercisesLibrary'] });
  void qc.invalidateQueries({ queryKey: ['exerciseSearch'] });
  // ExerciseDetail's hydration cache would otherwise outrank the fresh item
  // passed by upstream screens after an edit (staleTime is Infinity).
  void qc.invalidateQueries({ queryKey: ['exerciseDetail'] });
}


function translateExerciseError(key: string, fallback: string): string {
  switch (key) {
    case 'exerciseMutations.errors.saveWorkout': return i18n.t('exerciseMutations.errors.saveWorkout', { defaultValue: 'Failed to save workout' });
    case 'exerciseMutations.errors.updateWorkout': return i18n.t('exerciseMutations.errors.updateWorkout', { defaultValue: 'Failed to update workout' });
    case 'exerciseMutations.errors.saveActivity': return i18n.t('exerciseMutations.errors.saveActivity', { defaultValue: 'Failed to save activity' });
    case 'exerciseMutations.errors.updateActivity': return i18n.t('exerciseMutations.errors.updateActivity', { defaultValue: 'Failed to update activity' });
    default: return fallback;
  }
}

function translateExerciseConfirmTitle(key: string, fallback: string): string {
  switch (key) {
    case 'exerciseMutations.confirm.deleteWorkoutTitle': return i18n.t('exerciseMutations.confirm.deleteWorkoutTitle', { defaultValue: 'Delete Workout?' });
    case 'exerciseMutations.confirm.deleteActivityTitle': return i18n.t('exerciseMutations.confirm.deleteActivityTitle', { defaultValue: 'Delete Activity?' });
    default: return fallback;
  }
}

function translateExerciseConfirmMessage(key: string, fallback: string): string {
  switch (key) {
    case 'exerciseMutations.confirm.deleteWorkoutMessage': return i18n.t('exerciseMutations.confirm.deleteWorkoutMessage', { defaultValue: 'This workout and all its exercises will be permanently removed.' });
    case 'exerciseMutations.confirm.deleteActivityMessage': return i18n.t('exerciseMutations.confirm.deleteActivityMessage', { defaultValue: 'This activity will be permanently removed.' });
    default: return fallback;
  }
}

const isAuthzError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes('403') || error.message.includes('404');
};

// ---------------------------------------------------------------------------
// Internal factories
// ---------------------------------------------------------------------------

function useCrudMutation<TPayload, TResult>({
  mutationFn,
  errorKey,
  errorDefaultTitle,
  onMutationSuccess,
}: {
  mutationFn: (payload: TPayload) => Promise<TResult>;
  errorKey: string;
  errorDefaultTitle: string;
  onMutationSuccess?: (data: TResult, queryClient: QueryClient) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: onMutationSuccess
      ? (data: TResult) => onMutationSuccess(data, queryClient)
      : undefined,
    onError: () => {
      Toast.show({ type: 'error', text1: translateExerciseError(errorKey, errorDefaultTitle), text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache: (entryDate: string) =>
      invalidateExerciseCache(queryClient, entryDate),
  };
}

function useDeleteMutation({
  deleteFn,
  id,
  entryDate,
  confirmTitleKey,
  confirmTitleDefault,
  confirmMessageKey,
  confirmMessageDefault,
  onSuccess,
}: {
  deleteFn: (id: string) => Promise<void>;
  id: string;
  entryDate: string;
  confirmTitleKey: string;
  confirmTitleDefault: string;
  confirmMessageKey: string;
  confirmMessageDefault: string;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: () => deleteFn(id),
    onSuccess: () => {
      invalidateExerciseCache(queryClient, normalizedDate);
      onSuccess?.();
    },
    onError: () => {
      Toast.show({ type: 'error', text1: i18n.t('exerciseMutations.errors.deleteFailed', { defaultValue: 'Failed to delete' }), text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(translateExerciseConfirmTitle(confirmTitleKey, confirmTitleDefault), translateExerciseConfirmMessage(confirmMessageKey, confirmMessageDefault), [
      { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: i18n.t('common.delete', { defaultValue: 'Delete' }),
        style: 'destructive',
        onPress: () => mutation.mutate(),
      },
    ]);
  };

  const deleteEntry = () => mutation.mutate();

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache: () => invalidateExerciseCache(queryClient, normalizedDate),
  };
}

// ---------------------------------------------------------------------------
// Create / Update hooks
// ---------------------------------------------------------------------------

export function useCreateWorkout() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: (payload: CreatePresetSessionRequest) => createWorkout(payload),
    errorKey: 'exerciseMutations.errors.saveWorkout', errorDefaultTitle: 'Failed to save workout',
  });
  return { createSession: mutate, ...rest };
}

export function useUpdateWorkout() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePresetSessionRequest }) =>
      updateWorkout(id, payload),
    errorKey: 'exerciseMutations.errors.updateWorkout', errorDefaultTitle: 'Failed to update workout',
    onMutationSuccess: (updatedSession, queryClient) => {
      syncExerciseSessionInCache(queryClient, updatedSession);
    },
  });
  return { updateSession: mutate, ...rest };
}

export function useCreateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: (payload: CreateExerciseEntryPayload) => createExerciseEntry(payload),
    errorKey: 'exerciseMutations.errors.saveActivity', errorDefaultTitle: 'Failed to save activity',
  });
  return { createEntry: mutate, ...rest };
}

export function useUpdateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateExerciseEntryPayload }) =>
      updateExerciseEntry(id, payload),
    errorKey: 'exerciseMutations.errors.updateActivity', errorDefaultTitle: 'Failed to update activity',
  });
  return { updateEntry: mutate, ...rest };
}

// Bypasses useCrudMutation because that helper invalidates exercise *entry*
// caches keyed to a date — irrelevant for catalog mutations.
export function useCreateExercise() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createExercise,
    onSuccess: () => {
      invalidateExerciseLibraryCaches(queryClient);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('exerciseMutations.errors.createExercise', { defaultValue: 'Could not create exercise' }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });
  return { createExerciseAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateExercisePayload }) =>
      updateExercise(id, payload),
    onSuccess: () => {
      invalidateExerciseLibraryCaches(queryClient);
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? i18n.t('exerciseMutations.errors.editPermission', { defaultValue: "You don't have permission to edit this exercise." })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({ type: 'error', text1: i18n.t('exerciseMutations.errors.updateExercise', { defaultValue: 'Failed to update exercise' }), text2: message });
    },
  });
  return { updateExerciseAsync: mutation.mutateAsync, isPending: mutation.isPending };
}

// ---------------------------------------------------------------------------
// Delete hooks
// ---------------------------------------------------------------------------

interface UseDeleteWorkoutOptions {
  sessionId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteWorkout({ sessionId, entryDate, onSuccess }: UseDeleteWorkoutOptions) {
  return useDeleteMutation({
    deleteFn: deleteWorkoutApi,
    id: sessionId,
    entryDate,
    confirmTitleKey: 'exerciseMutations.confirm.deleteWorkoutTitle', confirmTitleDefault: 'Delete Workout?',
    confirmMessageKey: 'exerciseMutations.confirm.deleteWorkoutMessage', confirmMessageDefault: 'This workout and all its exercises will be permanently removed.',
    onSuccess,
  });
}

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
  return useDeleteMutation({
    deleteFn: deleteExerciseEntryApi,
    id: entryId,
    entryDate,
    confirmTitleKey: 'exerciseMutations.confirm.deleteActivityTitle', confirmTitleDefault: 'Delete Activity?',
    confirmMessageKey: 'exerciseMutations.confirm.deleteActivityMessage', confirmMessageDefault: 'This activity will be permanently removed.',
    onSuccess,
  });
}

interface UseDeleteExerciseLibraryOptions {
  exerciseId: string;
  onSuccess?: () => void;
}

export function useDeleteExerciseLibrary({
  exerciseId,
  onSuccess,
}: UseDeleteExerciseLibraryOptions) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteExerciseFromLibrary(exerciseId),
    onSuccess: () => {
      invalidateExerciseLibraryCaches(queryClient);
      onSuccess?.();
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? i18n.t('exerciseMutations.errors.deletePermission', { defaultValue: "You don't have permission to delete this exercise." })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({ type: 'error', text1: i18n.t('exerciseMutations.errors.deleteExercise', { defaultValue: 'Failed to delete exercise' }), text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      i18n.t('exerciseMutations.confirm.deleteExerciseTitle', { defaultValue: 'Delete Exercise?' }),
      i18n.t('exerciseMutations.confirm.deleteExerciseMessage', { defaultValue: 'This exercise will be removed from your library. Past logged sessions are preserved.' }),
      [
        { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: i18n.t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return { confirmAndDelete, isPending: mutation.isPending };
}
