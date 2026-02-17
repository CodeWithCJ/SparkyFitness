import {
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getWorkoutPresets,
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
} from '@/api/Exercises/workoutPresets';
import type { WorkoutPreset } from '@/types/workout';
import { presetKeys } from '@/api/keys/exercises';

// --- Queries ---

export const useWorkoutPresets = (userId?: string, limit: number = 10) => {
  const { t } = useTranslation();

  return useInfiniteQuery({
    queryKey: presetKeys.infinite(userId, limit),
    queryFn: ({ pageParam = 1 }) => getWorkoutPresets(pageParam, limit),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.length * limit;
      return lastPage.total > totalLoaded ? allPages.length + 1 : undefined;
    },
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
