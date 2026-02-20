import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchExerciseEntries,
  createExerciseEntry,
  updateExerciseEntry,
  deleteExerciseEntry,
  logWorkoutPreset,
  deleteExercisePresetEntry,
  fetchExerciseDetails,
  UpdateExerciseEntryPayload,
} from '@/api/Exercises/exerciseEntryService';
import { exerciseEntryKeys, exerciseKeys } from '@/api/keys/exercises';
import i18n from '@/i18n';

// --- Queries ---

export const useExerciseEntries = (date: string) => {
  return useQuery({
    queryKey: exerciseEntryKeys.byDate(date),
    queryFn: () => fetchExerciseEntries(date),
    enabled: !!date,
    staleTime: 0, // Always consider data stale so it refetches when needed
    refetchOnWindowFocus: true, // Refetch when user returns to the tab after a sync
  });
};

export const useCreateExerciseEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createExerciseEntry,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.byDate(variables.entry_date),
      });
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.history(variables.exercise_id),
      });
    },
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateExerciseEntryPayload;
    }) => updateExerciseEntry(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.byDate(data.entry_date),
      });
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.history(data.exercise_id),
      });
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
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteExerciseEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
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
    }: {
      presetId: string | number;
      date: string;
    }) => logWorkoutPreset(presetId, date),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.byDate(variables.date),
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

export const useDeleteExercisePresetEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteExercisePresetEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
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

export const exerciseDetailsOptions = (exerciseId: string) => ({
  queryKey: exerciseKeys.detail(exerciseId),
  queryFn: () => fetchExerciseDetails(exerciseId),
  staleTime: 1000 * 60 * 60,
  enabled: !!exerciseId,
  meta: {
    errorMessage: i18n.t(
      'exercise.failedToFetchDetails',
      'Could not fetch exercise details. Please try again.'
    ),
  },
});
