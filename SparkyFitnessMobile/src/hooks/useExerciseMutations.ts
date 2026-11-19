import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import type {
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
} from '@workspace/shared';
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
  type ExerciseDeleteMode,
  type ExerciseDeletionImpact,
  type CreateExerciseEntryPayload,
  type UpdateExercisePayload,
} from '../services/api/exerciseApi';
import { TimeoutError } from '../utils/concurrency';
import { normalizeDate } from '../utils/dateUtils';
import { serverMayBeDown } from '../utils/serverErrors';
import { queueWorkoutSessionDelete } from '../offline/workoutHandOver';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { syncExerciseSessionInCache } from './syncExerciseSessionInCache';
import {
  suggestedExercisesQueryKey,
  dailySummaryRootQueryKey,
  workoutPresetsQueryKey,
  exerciseHistoryQueryKey,
  exerciseStatsQueryKeyRoot,
} from './queryKeys';

// Library/catalog mutations don't have an `entryDate`, so they cannot reuse
// `invalidateExerciseCache` (which is keyed to a date). Use this helper to
// invalidate the library/search/recents/count/diary/preset caches after create/update/delete.
function invalidateExerciseLibraryCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
  void qc.invalidateQueries({ queryKey: ['exercises', 'count'] });
  void qc.resetQueries({ queryKey: ['exercisesLibrary'] });
  void qc.invalidateQueries({ queryKey: ['exerciseSearch'] });
  // ExerciseDetail's hydration cache would otherwise outrank the fresh item
  // passed by upstream screens after an edit (staleTime is Infinity).
  void qc.invalidateQueries({ queryKey: ['exerciseDetail'] });
  void qc.invalidateQueries({ queryKey: workoutPresetsQueryKey });
  void qc.invalidateQueries({ queryKey: ['workoutPresetsLibrary'] });
  void qc.invalidateQueries({ queryKey: ['workoutPresetSearch'] });
  void qc.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
  void qc.invalidateQueries({ queryKey: exerciseHistoryQueryKey });
  void qc.invalidateQueries({ queryKey: exerciseStatsQueryKeyRoot });
}

function translateExerciseError(key: string, fallback: string): string {
  switch (key) {
    case 'exerciseMutations.errors.saveWorkout':
      return i18n.t('exerciseMutations.errors.saveWorkout', {
        defaultValue: 'Failed to save workout',
      });
    case 'exerciseMutations.errors.updateWorkout':
      return i18n.t('exerciseMutations.errors.updateWorkout', {
        defaultValue: 'Failed to update workout',
      });
    case 'exerciseMutations.errors.saveActivity':
      return i18n.t('exerciseMutations.errors.saveActivity', {
        defaultValue: 'Failed to save activity',
      });
    case 'exerciseMutations.errors.updateActivity':
      return i18n.t('exerciseMutations.errors.updateActivity', {
        defaultValue: 'Failed to update activity',
      });
    default:
      return fallback;
  }
}

function translateExerciseConfirmTitle(key: string, fallback: string): string {
  switch (key) {
    case 'exerciseMutations.confirm.deleteWorkoutTitle':
      return i18n.t('exerciseMutations.confirm.deleteWorkoutTitle', {
        defaultValue: 'Delete Workout?',
      });
    case 'exerciseMutations.confirm.deleteActivityTitle':
      return i18n.t('exerciseMutations.confirm.deleteActivityTitle', {
        defaultValue: 'Delete Activity?',
      });
    default:
      return fallback;
  }
}

function translateExerciseConfirmMessage(
  key: string,
  fallback: string
): string {
  switch (key) {
    case 'exerciseMutations.confirm.deleteWorkoutMessage':
      return i18n.t('exerciseMutations.confirm.deleteWorkoutMessage', {
        defaultValue:
          'This workout and all its exercises will be permanently removed.',
      });
    case 'exerciseMutations.confirm.deleteActivityMessage':
      return i18n.t('exerciseMutations.confirm.deleteActivityMessage', {
        defaultValue: 'This activity will be permanently removed.',
      });
    default:
      return fallback;
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
  quietWhenServerAway = false,
}: {
  mutationFn: (payload: TPayload) => Promise<TResult>;
  errorKey: string;
  errorDefaultTitle: string;
  onMutationSuccess?: (data: TResult, queryClient: QueryClient) => void;
  /**
   * The caller keeps the change on the phone when the server cannot be
   * reached (#1983), so the failure is not announced as an error here. A
   * timeout still is, because the server may have received the request.
   */
  quietWhenServerAway?: boolean;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: onMutationSuccess
      ? (data: TResult) => onMutationSuccess(data, queryClient)
      : undefined,
    onError: (error: unknown) => {
      if (
        quietWhenServerAway &&
        serverMayBeDown(error) &&
        !(error instanceof TimeoutError)
      ) {
        return;
      }
      Toast.show({
        type: 'error',
        text1: translateExerciseError(errorKey, errorDefaultTitle),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
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
      Toast.show({
        type: 'error',
        text1: i18n.t('exerciseMutations.errors.deleteFailed', {
          defaultValue: 'Failed to delete',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      translateExerciseConfirmTitle(confirmTitleKey, confirmTitleDefault),
      translateExerciseConfirmMessage(confirmMessageKey, confirmMessageDefault),
      [
        {
          text: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: i18n.t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => mutation.mutate(),
        },
      ]
    );
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

export function useCreateWorkout(
  options: { quietWhenServerAway?: boolean } = {}
) {
  const { mutate, ...rest } = useCrudMutation({
    quietWhenServerAway: options.quietWhenServerAway,
    mutationFn: (payload: CreatePresetSessionRequest) => createWorkout(payload),
    errorKey: 'exerciseMutations.errors.saveWorkout',
    errorDefaultTitle: 'Failed to save workout',
  });
  return { createSession: mutate, ...rest };
}

export function useUpdateWorkout(
  options: { quietWhenServerAway?: boolean } = {}
) {
  const { mutate, ...rest } = useCrudMutation({
    quietWhenServerAway: options.quietWhenServerAway,
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdatePresetSessionRequest;
    }) => updateWorkout(id, payload),
    errorKey: 'exerciseMutations.errors.updateWorkout',
    errorDefaultTitle: 'Failed to update workout',
    onMutationSuccess: (updatedSession, queryClient) => {
      syncExerciseSessionInCache(queryClient, updatedSession);
    },
  });
  return { updateSession: mutate, ...rest };
}

export function useCreateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: (payload: CreateExerciseEntryPayload) =>
      createExerciseEntry(payload),
    errorKey: 'exerciseMutations.errors.saveActivity',
    errorDefaultTitle: 'Failed to save activity',
  });
  return { createEntry: mutate, ...rest };
}

export function useUpdateExerciseEntry() {
  const { mutate, ...rest } = useCrudMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateExerciseEntryPayload;
    }) => updateExerciseEntry(id, payload),
    errorKey: 'exerciseMutations.errors.updateActivity',
    errorDefaultTitle: 'Failed to update activity',
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
        text1: i18n.t('exerciseMutations.errors.createExercise', {
          defaultValue: 'Could not create exercise',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });
  return {
    createExerciseAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateExercisePayload;
    }) => updateExercise(id, payload),
    onSuccess: () => {
      invalidateExerciseLibraryCaches(queryClient);
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? i18n.t('exerciseMutations.errors.editPermission', {
            defaultValue: "You don't have permission to edit this exercise.",
          })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({
        type: 'error',
        text1: i18n.t('exerciseMutations.errors.updateExercise', {
          defaultValue: 'Failed to update exercise',
        }),
        text2: message,
      });
    },
  });
  return {
    updateExerciseAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// Delete hooks
// ---------------------------------------------------------------------------

interface UseDeleteWorkoutOptions {
  sessionId: string;
  entryDate: string;
  onSuccess?: () => void;
}

// With the server away the removal is kept on this phone and sent when it can
// be reached (#1983); the diary hides the workout meanwhile.
async function deleteWorkoutOrQueue(
  sessionId: string,
  entryDate: string
): Promise<void> {
  try {
    await deleteWorkoutApi(sessionId);
  } catch (error) {
    if (
      serverMayBeDown(error) &&
      (await queueWorkoutSessionDelete(sessionId, entryDate))
    ) {
      Toast.show({
        type: 'info',
        text1: i18n.t('offline.deleteSavedTitle', {
          defaultValue: 'Deleted on this phone',
        }),
        text2: i18n.t('offline.deleteSavedMessage', {
          defaultValue:
            'It is removed from your server once it can be reached.',
        }),
      });
      return;
    }
    throw error;
  }
}

export function useDeleteWorkout({
  sessionId,
  entryDate,
  onSuccess,
}: UseDeleteWorkoutOptions) {
  return useDeleteMutation({
    deleteFn: (id) => deleteWorkoutOrQueue(id, entryDate),
    id: sessionId,
    entryDate,
    confirmTitleKey: 'exerciseMutations.confirm.deleteWorkoutTitle',
    confirmTitleDefault: 'Delete Workout?',
    confirmMessageKey: 'exerciseMutations.confirm.deleteWorkoutMessage',
    confirmMessageDefault:
      'This workout and all its exercises will be permanently removed.',
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
    confirmTitleKey: 'exerciseMutations.confirm.deleteActivityTitle',
    confirmTitleDefault: 'Delete Activity?',
    confirmMessageKey: 'exerciseMutations.confirm.deleteActivityMessage',
    confirmMessageDefault: 'This activity will be permanently removed.',
    onSuccess,
  });
}

interface UseDeleteExerciseLibraryOptions {
  exerciseId: string;
  onSuccess?: (result?: { message?: string; status?: string }) => void;
}

/** One row of the delete ActionSheet. */
export interface ExerciseDeleteOption {
  mode: ExerciseDeleteMode;
  label: string;
  description: string;
  destructive: boolean;
  onSelect: () => void;
}

export function useDeleteExerciseLibrary({
  exerciseId,
  onSuccess,
}: UseDeleteExerciseLibraryOptions) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (mode: ExerciseDeleteMode) =>
      deleteExerciseFromLibrary(exerciseId, mode),
    onSuccess: (result) => {
      invalidateExerciseLibraryCaches(queryClient);
      // The server downgrades a delete to a hide when another user still
      // references the exercise, so report what actually happened rather than
      // what was asked for.
      if (result?.status === 'hidden') {
        Toast.show({
          type: 'info',
          text1: i18n.t('exerciseMutations.hidden.title', {
            defaultValue: 'Exercise hidden',
          }),
          text2: i18n.t('exerciseMutations.hidden.usedByOthers', {
            defaultValue:
              'It is used by other people, so it was hidden instead of deleted. Their history is unaffected.',
          }),
        });
      }
      onSuccess?.(result);
    },
    onError: (error) => {
      const message = isAuthzError(error)
        ? i18n.t('exerciseMutations.errors.deletePermission', {
            defaultValue: "You don't have permission to delete this exercise.",
          })
        : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({
        type: 'error',
        text1: i18n.t('exerciseMutations.errors.deleteExercise', {
          defaultValue: 'Failed to delete exercise',
        }),
        text2: message,
      });
    },
  });

  /**
   * Second step of the flow: once the user has picked `delete_with_history`,
   * confirm it separately. It is the only mode that destroys anything the user
   * cannot get back, so it never happens on a single tap.
   */
  const confirmDestructive = () => {
    Alert.alert(
      i18n.t('exerciseMutations.confirm.deleteWithHistoryTitle', {
        defaultValue: 'Delete workouts too?',
      }),
      i18n.t('exerciseMutations.confirm.deleteWithHistoryMessage', {
        defaultValue:
          'This also permanently deletes your logged workouts for this exercise. This cannot be undone.',
      }),
      [
        {
          text: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: i18n.t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => mutation.mutate('delete_with_history'),
        },
      ]
    );
  };

  /**
   * Builds the Hide / Delete / Delete-including-history choices for an
   * ActionSheet. `impact` decides which are offered: when anybody else
   * references the exercise, presets and plans would cascade out of THEIR data
   * too, so hiding is the only option that leaves them alone.
   *
   * Pass the impact from `getExerciseDeletionImpact`; while it is still loading
   * (null) only Hide is offered, because assuming nobody else uses it is the
   * one guess that can damage another person's data.
   */
  const buildDeleteOptions = (
    impact: ExerciseDeletionImpact | null
  ): ExerciseDeleteOption[] => {
    const hide: ExerciseDeleteOption = {
      mode: 'hide',
      label: i18n.t('exerciseMutations.options.hide', {
        defaultValue: 'Hide from search',
      }),
      description: i18n.t('exerciseMutations.options.hideDescription', {
        defaultValue:
          'Keeps everything as it is. The exercise just stops showing up when you search.',
      }),
      destructive: false,
      onSelect: () => mutation.mutate('hide'),
    };
    if (impact == null || impact.otherUserReferences > 0) return [hide];

    return [
      hide,
      {
        mode: 'delete',
        label: i18n.t('exerciseMutations.options.delete', {
          defaultValue: 'Delete',
        }),
        description: i18n.t('exerciseMutations.options.deleteDescription', {
          defaultValue:
            'Removes it from your library, presets and plans. Your logged workouts are kept.',
        }),
        destructive: false,
        onSelect: () => mutation.mutate('delete'),
      },
      {
        mode: 'delete_with_history',
        label: i18n.t('exerciseMutations.options.deleteWithHistory', {
          defaultValue: 'Delete including history',
        }),
        description: i18n.t(
          'exerciseMutations.options.deleteWithHistoryDescription',
          {
            defaultValue:
              'Also permanently deletes your logged workouts for this exercise.',
          }
        ),
        destructive: true,
        onSelect: confirmDestructive,
      },
    ];
  };

  return {
    buildDeleteOptions,
    isPending: mutation.isPending,
  };
}
