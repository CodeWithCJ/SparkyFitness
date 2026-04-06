// hooks/Exercises/useDeleteExercise.ts
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { error } from '@/utils/logging';
import type {
  Exercise as ExerciseInterface,
  ExerciseDeletionImpact,
} from '@/types/exercises';
import {
  exerciseDeletionImpactOptions,
  useDeleteExerciseMutation,
} from '@/hooks/Exercises/useExercises';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';

export function useDeleteExercise() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel } = usePreferences();
  const queryClient = useQueryClient();
  const { mutateAsync: deleteExercise } = useDeleteExerciseMutation();

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletionImpact, setDeletionImpact] =
    useState<ExerciseDeletionImpact | null>(null);
  const [exerciseToDelete, setExerciseToDelete] =
    useState<ExerciseInterface | null>(null);

  const handleDeleteRequest = async (exercise: ExerciseInterface) => {
    if (!user) return;
    try {
      const impact = await queryClient.fetchQuery(
        exerciseDeletionImpactOptions(exercise.id)
      );
      setDeletionImpact(impact);
      setExerciseToDelete(exercise);
      setShowDeleteConfirmation(true);
    } catch (err) {
      error(loggingLevel, 'Error fetching deletion impact:', err);
    }
  };

  const confirmDelete = async () => {
    if (!exerciseToDelete || !user) return;
    try {
      const shouldForce =
        deletionImpact &&
        !deletionImpact.isUsedByOthers &&
        deletionImpact.exerciseEntriesCount > 0;

      const response = await deleteExercise({
        id: exerciseToDelete.id,
        forceDelete: shouldForce ?? false,
      });

      if (
        response?.status === 'deleted' ||
        response?.status === 'force_deleted'
      ) {
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'exercise.databaseManager.deleteSuccess',
            'Exercise deleted successfully.'
          ),
        });
      } else if (response?.status === 'hidden') {
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'exercise.databaseManager.hiddenSuccess',
            'Exercise hidden (marked as quick). Historical entries remain.'
          ),
        });
      } else {
        toast({
          title: t('common.success', 'Success'),
          description:
            response?.message ??
            t(
              'exercise.databaseManager.deleteOperationCompleted',
              'Exercise delete operation completed.'
            ),
        });
      }
    } catch (err) {
      error(loggingLevel, 'Error deleting exercise:', err);
    } finally {
      setShowDeleteConfirmation(false);
      setExerciseToDelete(null);
      setDeletionImpact(null);
    }
  };

  return {
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    deletionImpact,
    exerciseToDelete,
    handleDeleteRequest,
    confirmDelete,
  };
}
