import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchExerciseEntries,
  createExerciseEntry,
  updateExerciseEntry,
  fetchExerciseProgressionStats,
  deleteExerciseEntry,
  createPresetSession,
  updatePresetSession,
  logWorkoutPreset,
  deleteExercisePresetEntry,
  getExerciseHistory,
  fetchWorkoutLocations,
  fetchCalorieLinkSuggestions,
  setCalorieLink,
  clearCalorieLink,
} from '@/api/Exercises/exerciseEntryService';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { HttpApiError } from '@/api/api';
import { dailyProgressKeys } from '@/api/keys/diary';
import { goalKeys } from '@/api/keys/goals';
import { shoeKeys } from '@/api/keys/shoes';
import {
  SetCalorieLinkRequest,
  UpdateExerciseEntryRequest,
  UpdatePresetSessionRequest,
} from '@workspace/shared';
import { useDiaryInvalidation } from '../useInvalidateKeys';

// --- Queries ---

export const useExerciseEntries = (date: string, userId?: string) => {
  return useQuery({
    queryKey: exerciseEntryKeys.byDate(date, userId),
    queryFn: () => fetchExerciseEntries(date, userId),
    enabled: !!date,
    staleTime: 0, // Always consider data stale so it refetches when needed
    refetchOnWindowFocus: true, // Refetch when user returns to the tab after a sync
  });
};

/** Previously logged gym / location names, most recent first. */
export const useWorkoutLocations = () => {
  return useQuery({
    queryKey: exerciseEntryKeys.locations(),
    queryFn: fetchWorkoutLocations,
    staleTime: 60_000,
  });
};

export const useExerciseHistory = (exerciseId: string, limit: number = 5) => {
  return useQuery({
    queryKey: exerciseEntryKeys.history(exerciseId, limit),
    queryFn: () => getExerciseHistory(exerciseId, limit),
    enabled: !!exerciseId,
  });
};

export const useCreateExerciseEntryMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: createExerciseEntry,
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'diary.exerciseEntry.createSuccess',
        'Exercise logged successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.createError',
        'Failed to log exercise.'
      ),
    },
  });
};

export const useUpdateExerciseEntryMutation = () => {
  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateExerciseEntryRequest & { imageFile: File | null };
    }) => updateExerciseEntry(id, data),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
    },
    meta: {
      successMessage: t(
        'diary.exerciseEntry.updateSuccess',
        'Exercise entry updated successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.updateError',
        'Failed to update exercise entry.'
      ),
    },
  });
};

export const useDeleteExerciseEntryMutation = () => {
  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteExerciseEntry,
    onSuccess: () => {
      invalidate();
      // A linked run counts toward its shoe's mileage and run count.
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
    },
    meta: {
      successMessage: t(
        'diary.exerciseEntry.deleteSuccess',
        'Exercise entry deleted successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.deleteError',
        'Failed to delete exercise entry.'
      ),
    },
  });
};

export const useLogWorkoutPresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      presetId,
      date,
      workoutPlanAssignmentId,
    }: {
      presetId: string | number;
      date: string;
      workoutPlanAssignmentId?: number | string | null;
    }) => logWorkoutPreset(presetId, date, workoutPlanAssignmentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.byDate(variables.date),
      });
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
      });
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
      queryClient.invalidateQueries({
        queryKey: ['workoutPlanTemplates'],
      });
    },
    meta: {
      successMessage: t(
        'diary.exerciseEntry.logPresetSuccess',
        'Workout preset logged successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.logPresetError',
        'Failed to log workout preset.'
      ),
    },
  });
};

export const useCreatePresetSessionMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createPresetSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
      queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workoutPlanTemplates'] });
    },
    meta: {
      successMessage: t(
        'diary.exerciseEntry.createPresetSessionSuccess',
        'Workout saved successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.createPresetSessionError',
        'Failed to save workout.'
      ),
    },
  });
};

/**
 * Updates a grouped workout session, including the #1995 phase 1 lifecycle
 * writes (finish stamps finished_at, resume sends null). No toast meta: the
 * resume call is followed by navigation and the finish call already shows
 * its own summary dialog.
 */
export const useUpdatePresetSessionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      presetEntryId,
      payload,
    }: {
      presetEntryId: string;
      payload: UpdatePresetSessionRequest;
    }) => updatePresetSession(presetEntryId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
      queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
    },
  });
};

export const useDeleteExercisePresetEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteExercisePresetEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
      });
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workoutPlanTemplates'] });
    },
    meta: {
      successMessage: t(
        'diary.exerciseEntry.deletePresetSuccess',
        'Preset entry deleted successfully.'
      ),
      errorMessage: t(
        'diary.exerciseEntry.deletePresetError',
        'Failed to delete preset entry.'
      ),
    },
  });
};

export { fetchExerciseProgressionStats };

// --- Calorie link (a logged workout and the same session synced from a watch) ---

export const useCalorieLinkSuggestions = (
  entryId: string,
  enabled: boolean
) => {
  return useQuery({
    queryKey: exerciseEntryKeys.calorieLink(entryId),
    queryFn: () => fetchCalorieLinkSuggestions(entryId),
    enabled,
    staleTime: 0,
  });
};

export const useSetCalorieLinkMutation = () => {
  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      entryId,
      body,
    }: {
      entryId: string;
      body: SetCalorieLinkRequest;
    }) => setCalorieLink(entryId, body),
    onSuccess: (_data, { entryId }) => {
      invalidate();
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.calorieLink(entryId),
      });
    },
    meta: {
      successMessage: t(
        'exercise.calorieLink.linked',
        'Workouts linked. The session now counts once.'
      ),
      errorMessage: t(
        'exercise.calorieLink.linkError',
        'Failed to link the workouts.'
      ),
    },
  });
};

export const useClearCalorieLinkMutation = () => {
  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (entryId: string) => clearCalorieLink(entryId),
    onSuccess: (_data, entryId) => {
      invalidate();
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.calorieLink(entryId),
      });
    },
    meta: {
      successMessage: t(
        'exercise.calorieLink.unlinked',
        'Workouts unlinked. Each counts its own calories again.'
      ),
      errorMessage: t(
        'exercise.calorieLink.unlinkError',
        'Failed to unlink the workouts.'
      ),
    },
  });
};
/**
 * True when the server refused a preset-session write because the session
 * changed on another device or tab (#1995 phase 1 revision check).
 * Pages route on this instead of importing the API error class directly.
 */
export const isPresetSessionConflictError = (error: unknown): boolean =>
  error instanceof HttpApiError && error.status === 409;
