import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getWorkoutPresets,
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
  searchWorkoutPresets,
} from '@/api/Exercises/workoutPresets';
import type { WorkoutPreset } from '@/types/workout';
import { presetKeys } from '@/api/keys/exercises';

// --- Queries ---

/**
 * Loads one page of the workout presets visible to the signed-in user. The
 * query key carries the user id, and the placeholder only reuses a previous
 * page belonging to the same user, so a page cached for one account is never
 * rendered for another.
 */
export const useWorkoutPresets = (
  userId?: string,
  page: number = 1,
  limit: number = 10
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: presetKeys.list(userId, page, limit),
    queryFn: () => getWorkoutPresets(page, limit),
    // Keep the table populated while the next page loads, but never across an
    // account switch: without this guard `keepPreviousData` would briefly show
    // the previous account's presets.
    placeholderData: (previousData, previousQuery) =>
      previousQuery && presetKeys.listUserId(previousQuery.queryKey) === userId
        ? previousData
        : undefined,
    enabled: !!userId,
    meta: {
      errorMessage: t(
        'workoutPresetsManager.failedToLoadPresets',
        'Failed to load workout presets.'
      ),
    },
  });
};

// --- Mutations ---

export const useCreateWorkoutPresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createWorkoutPreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: presetKeys.lists() });
    },
    meta: {
      successMessage: t(
        'workoutPresetsManager.createSuccess',
        'Workout preset created successfully.'
      ),
      errorMessage: t(
        'workoutPresetsManager.createError',
        'Failed to create workout preset.'
      ),
    },
  });
};

export const useUpdateWorkoutPresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WorkoutPreset> }) =>
      updateWorkoutPreset(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: presetKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: presetKeys.detail(variables.id),
      });
    },
    meta: {
      successMessage: t(
        'workoutPresetsManager.updateSuccess',
        'Workout preset updated successfully.'
      ),
      errorMessage: t(
        'workoutPresetsManager.updateError',
        'Failed to update workout preset.'
      ),
    },
  });
};

export const useDeleteWorkoutPresetMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteWorkoutPreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: presetKeys.lists() });
    },
    meta: {
      successMessage: t(
        'workoutPresetsManager.deleteSuccess',
        'Workout preset deleted successfully.'
      ),
      errorMessage: t(
        'workoutPresetsManager.deleteError',
        'Failed to delete workout preset.'
      ),
    },
  });
};

export const useSearchWorkoutPresets = (
  searchTerm: string,
  userId?: string,
  limit: number = 10
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: presetKeys.search(searchTerm, userId, limit),
    queryFn: () => searchWorkoutPresets(searchTerm, limit),
    enabled: !!userId && searchTerm.trim().length > 0,
    meta: {
      errorMessage: t(
        'workoutPresetsManager.failedToLoadPresets',
        'Failed to load workout presets.'
      ),
    },
  });
};
