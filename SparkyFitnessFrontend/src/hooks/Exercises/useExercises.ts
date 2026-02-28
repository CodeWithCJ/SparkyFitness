import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  useQueries,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  assetKeys,
  exerciseEntryKeys,
  exerciseKeys,
  suggestedExercisesKeys,
} from '@/api/keys/exercises';
import {
  loadExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  updateExerciseShareStatus,
  getExerciseDeletionImpact,
  updateExerciseEntriesSnapshot,
  ExercisePayload,
  importExercisesFromJson,
  importExerciseHistory,
  getExerciseById,
  getSuggestedExercises,
  getBodyMapSvg,
} from '@/api/Exercises/exerciseService';
import i18n from '@/i18n';
import {
  getActivityDetails,
  getExerciseHistory,
  getExerciseProgressData,
} from '@/api/Exercises/exerciseEntryService';
import { ExerciseOwnershipFilter } from '@/types/exercises';
import { getComparisonDates } from '@/utils/reportUtil';
import { useMemo } from 'react';

// --- Queries ---

export const useExercises = (
  searchTerm: string,
  categoryFilter: string,
  ownershipFilter: ExerciseOwnershipFilter,
  page: number,
  itemsPerPage: number,
  userId?: string
) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: exerciseKeys.list(
      searchTerm,
      categoryFilter,
      ownershipFilter,
      page,
      itemsPerPage
    ),
    queryFn: () =>
      loadExercises(
        searchTerm,
        categoryFilter,
        ownershipFilter,
        page,
        itemsPerPage
      ),
    placeholderData: keepPreviousData,
    enabled: !!userId,
    meta: {
      errorMessage: t(
        'exercise.databaseManager.failedToLoadExercises',
        'Failed to load exercises'
      ),
    },
  });
};

export const exerciseDeletionImpactOptions = (exerciseId: string | null) => ({
  queryKey: exerciseId
    ? exerciseKeys.impact(exerciseId)
    : (['exercises', 'impact', 'disabled'] as const),
  queryFn: () => getExerciseDeletionImpact(exerciseId!),
  enabled: !!exerciseId,
  staleTime: 0,
  meta: {
    errorMessage: 'Could not fetch deletion impact. Please try again.',
  },
});
// --- Mutations ---

export const useCreateExerciseMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (payload: ExercisePayload | FormData) =>
      createExercise(payload),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: exerciseKeys.lists(),
      });
    },
    meta: {
      successMessage: t('common.success', 'Success'),
      errorMessage: t('common.error', 'Error creating exercise'),
    },
  });
};

export const useUpdateExerciseMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<ExercisePayload> | FormData;
    }) => updateExercise(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: exerciseKeys.detail(variables.id),
      });
    },
    meta: {
      successMessage: t(
        'exercise.databaseManager.editSuccess',
        'Exercise edited successfully'
      ),
      errorMessage: t(
        'exercise.databaseManager.failedToEditExercise',
        'Failed to edit exercise'
      ),
    },
  });
};

export const useDeleteExerciseMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      forceDelete = false,
    }: {
      id: string;
      forceDelete?: boolean;
    }) => deleteExercise(id, forceDelete),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: exerciseKeys.lists(),
      });
    },
    meta: {
      errorMessage: t(
        'exercise.databaseManager.failedToDeleteExercise',
        'Failed to delete exercise.'
      ),
      successMessage: (data) => {
        const response = data as { message?: string; status?: string } | void;
        if (response && response.status === 'hidden') {
          return t(
            'exercise.databaseManager.hiddenSuccess',
            'Exercise hidden (marked as quick). Historical entries remain.'
          );
        }
        return t(
          'exercise.databaseManager.deleteSuccess',
          'Exercise deleted successfully.'
        );
      },
    },
  });
};

export const useUpdateExerciseShareStatusMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      sharedWithPublic,
    }: {
      id: string;
      sharedWithPublic: boolean;
    }) => updateExerciseShareStatus(id, sharedWithPublic),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: exerciseKeys.detail(variables.id),
      });
    },
    meta: {
      errorMessage: t(
        'exercise.databaseManager.failedToShareExercise',
        'Failed to share exercise'
      ),
      successMessage: (_data, variables) => {
        const typedVars = variables as {
          id: string;
          sharedWithPublic: boolean;
        };
        return t('exercise.databaseManager.shareStatusSuccess', {
          shareStatus: typedVars.sharedWithPublic ? 'shared' : 'unshared',
        });
      },
    },
  });
};

export const useUpdateExerciseEntriesSnapshotMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (exerciseId: string) =>
      updateExerciseEntriesSnapshot(exerciseId),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
    },
    meta: {
      successMessage: t(
        'exercise.databaseManager.syncSuccess',
        'Past diary entries have been updated.'
      ),
      errorMessage: t(
        'exercise.databaseManager.syncError',
        'Failed to update past diary entries.'
      ),
    },
  });
};
export const useImportExercisesJsonMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: importExercisesFromJson,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
    },
    meta: {
      successMessage: t(
        'exercise.addExerciseDialog.importSuccess',
        'Exercise data imported successfully'
      ),
    },
  });
};

export const useImportExerciseHistoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: importExerciseHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exerciseKeys.all });
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    },
    meta: {
      successMessage: t(
        'exercise.importHistoryCSV.importSuccess',
        'Historical exercise entries imported successfully.'
      ),
    },
  });
};

export const exerciseByIdOptions = (id: string) => ({
  queryKey: exerciseKeys.detail(id),
  queryFn: () => getExerciseById(id),
  enabled: !!id,
  meta: {
    errorMessage: i18n.t(
      'exercise.failedToFetchById',
      'Could not load exercise details.'
    ),
  },
});
export const useSuggestedExercises = (limit: number) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: suggestedExercisesKeys.byLimit(limit),
    queryFn: () => getSuggestedExercises(limit),
    enabled: limit > 0,
    meta: {
      errorMessage: t(
        'exercise.failedToFetchSuggested',
        'Could not load suggested exercises.'
      ),
    },
  });
};

export const useExerciseHistory = (exerciseId: string, limit: number = 5) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: exerciseEntryKeys.history(exerciseId, limit),
    queryFn: () => getExerciseHistory(exerciseId, limit),
    enabled: !!exerciseId,
    meta: {
      errorMessage: t(
        'exercise.history.loadError',
        'Failed to load exercise history.'
      ),
    },
  });
};

export const exerciseProgressOptions = (
  exerciseId: string,
  startDate: string,
  endDate: string,
  aggregationLevel: string = 'daily'
) => ({
  queryKey: exerciseEntryKeys.progress(
    exerciseId,
    startDate,
    endDate,
    aggregationLevel
  ),
  queryFn: () =>
    getExerciseProgressData(exerciseId, startDate, endDate, aggregationLevel),
  enabled: !!exerciseId && !!startDate && !!endDate,
  meta: {
    errorMessage: i18n.t(
      'exercise.progress.loadError',
      'Failed to load exercise progress data.'
    ),
  },
});

export const useActivityDetailsQuery = (
  exerciseEntryId: string,
  providerName: string
) => {
  return useQuery({
    queryKey: exerciseEntryKeys.activityDetails(
      exerciseEntryId as string,
      providerName as string
    ),
    queryFn: () =>
      getActivityDetails(exerciseEntryId as string, providerName as string),
    enabled: Boolean(exerciseEntryId && providerName),
    meta: {
      errorMessage: `Failed to fetch ${providerName} activity details.`,
    },
  });
};

export const useBodyMapSvgQuery = () => {
  return useQuery({
    queryKey: assetKeys.svg('muscle-male'),
    queryFn: getBodyMapSvg,
    staleTime: Infinity,
    meta: {
      errorMessage: 'Error fetching body map SVG',
    },
  });
};

interface ExerciseQueryProps {
  selectedExercisesForChart: string[];
  startDate: string | null;
  endDate: string | null;
  aggregationLevel: string;
  comparisonPeriod: string | null;
}

export const useExerciseProgressQueries = ({
  selectedExercisesForChart,
  startDate,
  endDate,
  aggregationLevel,
  comparisonPeriod,
}: ExerciseQueryProps) => {
  const { t } = useTranslation();
  const compDates = useMemo(
    () =>
      comparisonPeriod && startDate && endDate
        ? getComparisonDates(startDate, endDate, comparisonPeriod)
        : null,
    [startDate, endDate, comparisonPeriod]
  );

  const mainQueries = useQueries({
    queries: selectedExercisesForChart.map((exerciseId) => ({
      ...exerciseProgressOptions(
        exerciseId,
        startDate ?? '',
        endDate ?? '',
        aggregationLevel
      ),
      enabled: Boolean(
        startDate && endDate && selectedExercisesForChart.length > 0
      ),
      meta: {
        errorMessage: t(
          'exerciseReportsDashboard.failedToLoadExerciseProgressData',
          'Failed to load exercise progress data.'
        ),
      },
    })),
  });

  const comparisonQueries = useQueries({
    queries: selectedExercisesForChart.map((exerciseId) => ({
      ...exerciseProgressOptions(
        exerciseId,
        compDates?.[0] ?? '',
        compDates?.[1] ?? '',
        aggregationLevel
      ),
      enabled: Boolean(compDates && selectedExercisesForChart.length > 0),
      meta: {
        errorMessage: t(
          'exerciseReportsDashboard.failedToLoadComparisonData',
          'Failed to load comparison data.'
        ),
      },
    })),
  });

  return { mainQueries, comparisonQueries };
};
