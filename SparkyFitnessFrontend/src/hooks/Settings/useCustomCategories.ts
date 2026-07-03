import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from '@/api/Settings/customCategoryService';
import { checkInKeys } from '@/api/keys/checkin';
import {
  CreateCustomCategoriesRequest,
  UpdateCustomCategoriesRequest,
} from '@workspace/shared';

export const useCustomCategories = (userId?: string) => {
  return useQuery({
    queryKey: checkInKeys.customCategories(userId),
    queryFn: () => getCategories(),
    enabled: !!userId,
  });
};

export const useAddCategoryMutation = (userId?: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (categoryData: CreateCustomCategoriesRequest) =>
      addCategory(categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: checkInKeys.customCategories(userId),
      });
    },
    meta: {
      successMessage: t(
        'customCategoryManager.addCategorySuccess',
        'Custom category added successfully'
      ),
      errorMessage: t(
        'customCategoryManager.addCategoryError',
        'Failed to add custom category'
      ),
    },
  });
};

export const useUpdateCategoryMutation = (userId?: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      categoryId,
      categoryData,
    }: {
      categoryId: string;
      categoryData: UpdateCustomCategoriesRequest;
    }) => updateCategory(categoryId, categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: checkInKeys.customCategories(userId),
      });
    },
    meta: {
      successMessage: t(
        'customCategoryManager.updateCategorySuccess',
        'Custom category updated successfully'
      ),
      errorMessage: t(
        'customCategoryManager.updateCategoryError',
        'Failed to update custom category'
      ),
    },
  });
};

export const useDeleteCategoryMutation = (userId?: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: checkInKeys.customCategories(userId),
      });
    },
    meta: {
      successMessage: t(
        'customCategoryManager.deleteCategorySuccess',
        'Custom category deleted successfully'
      ),
      errorMessage: t(
        'customCategoryManager.deleteCategoryError',
        'Failed to delete custom category'
      ),
    },
  });
};
