import { mealPlanKeys } from '@/api/keys/meals';
import {
  createMealPlanTemplate,
  deleteMealPlanTemplate,
  getMealPlanTemplates,
  updateMealPlanTemplate,
} from '@/api/Foods/mealPlanTemplate';
import { MealPlanTemplate } from '@/types/meal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useMealPlanTemplates = (userId: string) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: mealPlanKeys.all(userId),
    queryFn: () => getMealPlanTemplates(userId),
    meta: {
      errorTitle: t('common.error', 'Error'),
      errorMessage: t(
        'mealManagement.failedToLoadMeals',
        'Failed to load meals.'
      ),
    },
  });
};
export const useCreateMealPlanMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      templateData,
      currentClientDate,
    }: {
      userId: string;
      templateData: Partial<MealPlanTemplate>;
      currentClientDate: string;
    }) => createMealPlanTemplate(userId, templateData, currentClientDate),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.all(variables.userId),
      });
    },
  });
};
export const useUpdateMealPlanMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      templateData,
      currentClientDate,
    }: {
      userId: string;
      templateData: Partial<MealPlanTemplate>;
      currentClientDate: string;
    }) =>
      updateMealPlanTemplate(
        userId,
        templateData.id,
        templateData,
        currentClientDate
      ),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.all(variables.userId),
      });
    },
  });
};
export const useDeleteMealPlanMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      templateId,
    }: {
      userId: string;
      templateId: string;
    }) => deleteMealPlanTemplate(userId, templateId),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.all(variables.userId),
      });
    },
  });
};
