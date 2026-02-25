import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from '@/api/Settings/customCategoryService';
import { customCategoryKeys } from '@/api/keys/settings';

export const useCustomCategories = (userId?: string) => {
  return useQuery({
    queryKey: customCategoryKeys.lists(),
    queryFn: () => getCategories(),
    enabled: !!userId,
  });
};

export const useAddCategoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (categoryData: {
      user_id: string;
      name: string;
      display_name?: string;
      measurement_type: string;
      frequency: string;
      data_type: string;
    }) => addCategory(categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customCategoryKeys.lists(),
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

export const useUpdateCategoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      categoryId,
      categoryData,
    }: {
      categoryId: string;
      categoryData: {
        name?: string;
        display_name?: string;
        measurement_type?: string;
        frequency?: string;
        data_type?: string;
      };
    }) => updateCategory(categoryId, categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customCategoryKeys.lists(),
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

export const useDeleteCategoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customCategoryKeys.lists(),
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
