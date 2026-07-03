import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createMealType,
  deleteMealType,
  getMealTypes,
  updateMealType,
} from '@/api/Diary/mealTypeService';
import { mealTypeKeys } from '@/api/keys/diary';
import { createMealFromDiary } from '@/api/Foods/meals';
import { mealKeys } from '@/api/keys/meals';

export const useMealTypes = () => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: mealTypeKeys.lists(),
    queryFn: getMealTypes,
    meta: {
      errorMessage: t(
        'mealTypeManager.loadError',
        'Failed to load meal categories.'
      ),
    },
  });
};
export const useCreateMealTypeMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createMealType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mealTypeKeys.lists() });
    },
    meta: {
      successMessage: t('mealTypeManager.addSuccess', 'Meal category added.'),
      errorMessage: t('common.error', 'An error occurred'),
    },
  });
};

export const useUpdateMealTypeMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        sort_order?: number;
        is_visible?: boolean;
        show_in_quick_log?: boolean;
      };
    }) => updateMealType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mealTypeKeys.lists() });
    },
    meta: {
      successMessage: t(
        'mealTypeManager.updateSuccess',
        'Meal category updated.'
      ),
      errorMessage: t('common.error', 'An error occurred'),
    },
  });
};

export const useDeleteMealTypeMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteMealType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mealTypeKeys.lists() });
    },
    meta: {
      successMessage: t(
        'mealTypeManager.deleteSuccess',
        'Meal category deleted.'
      ),
      errorMessage: t('common.error', 'Failed to delete.'),
    },
  });
};
export const useCreateMealFromDiaryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      date,
      mealType,
      mealName,
      description,
      isPublic,
    }: {
      date: string;
      mealType: string;
      mealName: string;
      description: string | null;
      isPublic: boolean;
    }) => createMealFromDiary(date, mealType, mealName, description, isPublic),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'mealCreation.failedToCreateMeal',
        'Failed to create meal from diary entries.'
      ),
      successMessage: t(
        'mealCreation.mealCreatedSuccessfully',
        'Meal created successfully from diary entries.'
      ),
    },
  });
};
