import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getWorkoutPlanTemplates,
  createWorkoutPlanTemplate,
  updateWorkoutPlanTemplate,
  deleteWorkoutPlanTemplate,
} from '@/api/Exercises/workoutPlanTemplates';
import type { WorkoutPlanTemplate } from '@/types/workout';

export const workoutPlanKeys = {
  all: ['workoutPlanTemplates'] as const,
  lists: () => [...workoutPlanKeys.all, 'list'] as const,
  details: () => [...workoutPlanKeys.all, 'detail'] as const,
  detail: (id: string) => [...workoutPlanKeys.details(), id] as const,
};

// --- Queries ---

export const useWorkoutPlanTemplates = (userId?: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: workoutPlanKeys.lists(),
    queryFn: async () => {
      const plans = await getWorkoutPlanTemplates();
      return plans.sort((a, b) => a.plan_name.localeCompare(b.plan_name));
    },
    enabled: !!userId,
    meta: {
      errorMessage: t(
        'workoutPlansManager.failedToLoadPlans',
        'Failed to load workout plans.'
      ),
    },
  });
};

// --- Mutations ---

export const useCreateWorkoutPlanTemplateMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: Omit<
        WorkoutPlanTemplate,
        'id' | 'user_id' | 'created_at' | 'updated_at'
      >;
    }) => createWorkoutPlanTemplate(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutPlanKeys.lists() });
    },
    meta: {
      successMessage: t(
        'workoutPlansManager.createSuccess',
        'Workout plan created successfully.'
      ),
      errorMessage: t(
        'workoutPlansManager.createError',
        'Failed to create workout plan.'
      ),
    },
  });
};

export const useUpdateWorkoutPlanTemplateMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<WorkoutPlanTemplate>;
    }) => updateWorkoutPlanTemplate(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: workoutPlanKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: workoutPlanKeys.detail(variables.id),
      });
    },
    meta: {
      errorMessage: t(
        'workoutPlansManager.updateError',
        'Failed to update workout plan.'
      ),
      successMessage: (_data, variables) => {
        const typedVars = variables as { data: Partial<WorkoutPlanTemplate> };

        if (
          Object.keys(typedVars.data).length === 1 &&
          'is_active' in typedVars.data
        ) {
          return t('workoutPlansManager.toggleStatusSuccess', {
            status: typedVars.data.is_active ? 'activated' : 'deactivated',
            defaultValue: `Workout plan ${typedVars.data.is_active ? 'activated' : 'deactivated'} successfully.`,
          });
        }

        return t(
          'workoutPlansManager.updateSuccess',
          'Workout plan updated successfully.'
        );
      },
    },
  });
};

export const useDeleteWorkoutPlanTemplateMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => deleteWorkoutPlanTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutPlanKeys.lists() });
    },
    meta: {
      successMessage: t(
        'workoutPlansManager.deleteSuccess',
        'Workout plan deleted successfully.'
      ),
      errorMessage: t(
        'workoutPlansManager.deleteError',
        'Failed to delete workout plan.'
      ),
    },
  });
};
