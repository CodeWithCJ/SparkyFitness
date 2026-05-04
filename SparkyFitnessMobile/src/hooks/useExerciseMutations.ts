import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
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
  errorTitle,
  onMutationSuccess,
}: {
  mutationFn: (payload: TPayload) => Promise<TResult>;
  errorTitle: string;
  onMutationSuccess?: (data: TResult, queryClient: QueryClient) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: onMutationSuccess
      ? (data: TResult) => onMutationSuccess(data, queryClient)
      : undefined,
    onError: () => {
      Toast.show({ type: 'error', text1: errorTitle, text2: 'Please try again.' });
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
  confirmTitle,
  confirmMessage,
  onSuccess,
}: {
  deleteFn: (id: string) => Promise<void>;
  id: string;
  entryDate: string;
  confirmTitle: string;
  confirmMessage: string;
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
      Toast.show({ type: 'error', text1: 'Failed to delete', text2: 'Please try again.' });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => mutation.mutate(),
      },
    ]);
  };

  return {
    confirmAndDelete,
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
    errorTitle: 'Failed to save workout',
  });
  return { createSession: mutate, ...rest };
}

export function useUpdateWorkout() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePresetSessionRequest }) =>
      updateWorkout(id, payload),
    errorTitle: 'Failed to update workout',
    onMutationSuccess: (updatedSession, queryClient) => {
      syncExerciseSessionInCache(queryClient, updatedSession);
    },
  });
  return { updateSession: mutate, ...rest };
}

export function useCreateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: (payload: CreateExerciseEntryPayload) => createExerciseEntry(payload),
    errorTitle: 'Failed to save activity',
  });
  return { createEntry: mutate, ...rest };
}

export function useUpdateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateExerciseEntryPayload }) =>
      updateExerciseEntry(id, payload),
    errorTitle: 'Failed to update activity',
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
        text1: 'Could not create exercise',
        text2: 'Please try again.',
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
        ? "You don't have permission to edit this exercise."
        : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Failed to update exercise', text2: message });
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
    confirmTitle: 'Delete Workout?',
    confirmMessage: 'This workout and all its exercises will be permanently removed.',
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
    confirmTitle: 'Delete Activity?',
    confirmMessage: 'This activity will be permanently removed.',
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
        ? "You don't have permission to delete this exercise."
        : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Failed to delete exercise', text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      'Delete Exercise?',
      'This exercise will be removed from your library. Past logged sessions are preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return { confirmAndDelete, isPending: mutation.isPending };
}
