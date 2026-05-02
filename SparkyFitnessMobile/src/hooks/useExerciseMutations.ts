import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  createWorkout,
  updateWorkout,
  deleteWorkout as deleteWorkoutApi,
  createExerciseEntry,
  updateExerciseEntry,
  deleteExerciseEntry as deleteExerciseEntryApi,
  createExercise,
  type CreateExerciseEntryPayload,
} from '../services/api/exerciseApi';
import { normalizeDate } from '../utils/dateUtils';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { syncExerciseSessionInCache } from './syncExerciseSessionInCache';
import { suggestedExercisesQueryKey } from './queryKeys';
import type { CreatePresetSessionRequest, UpdatePresetSessionRequest } from '@workspace/shared';

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
// caches keyed to a date — irrelevant for creating a catalog row. We instead
// invalidate the recents/count and reset the infinite ExercisesLibrary list.
export function useCreateExercise() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createExercise,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['exercises', 'count'] });
      // useExercisesLibrary is an infinite query — resetQueries (not
      // invalidateQueries) so returning to ExercisesLibrary refetches just
      // page 1, matching the useFoodsLibrary pattern.
      void queryClient.resetQueries({ queryKey: ['exercisesLibrary'] });
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
