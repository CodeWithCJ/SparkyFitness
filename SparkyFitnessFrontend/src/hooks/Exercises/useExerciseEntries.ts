import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchExerciseEntries,
  createExerciseEntry,
  updateExerciseEntry,
  deleteExerciseEntry,
  logWorkoutPreset,
  deleteExercisePresetEntry,
  fetchExerciseDetails,
  fetchExerciseEntryHistoryV2,
  getExerciseHistory,
} from '@/api/Exercises/exerciseEntryService';
import { exerciseEntryKeys, exerciseKeys } from '@/api/keys/exercises';
import i18n from '@/i18n';
import { dailyProgressKeys } from '@/api/keys/diary';
import { UpdateExerciseEntryRequest } from '@workspace/shared';

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

export const useExerciseHistory = (exerciseId: string, limit: number = 5) => {
  return useQuery({
    queryKey: exerciseEntryKeys.history(exerciseId, limit),
    queryFn: () => getExerciseHistory(exerciseId, limit),
    enabled: !!exerciseId,
  });
};

export const useInfiniteExerciseHistoryV2 = (
  userId?: string,
  pageSize: number = 20
) => {
  return useInfiniteQuery({
    queryKey: exerciseEntryKeys.historyV2(userId, pageSize),
    queryFn: ({ pageParam = 1 }) =>
      fetchExerciseEntryHistoryV2(pageParam as number, pageSize, userId),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
  });
};

export const useCreateExerciseEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createExerciseEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
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
      data: UpdateExerciseEntryRequest & { imageFile: File | null };
    }) => updateExerciseEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: exerciseEntryKeys.all,
      });
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
      });
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
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
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
      queryClient.invalidateQueries({
        queryKey: dailyProgressKeys.all,
      });
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
