import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getGlobalAIServices,
  createGlobalAIService,
  updateGlobalAIService,
  deleteGlobalAIService,
  type AIService,
} from '@/services/aiServiceSettingsService';
import { aiServiceKeys } from '@/api/keys/admin';

// Query hook for fetching global AI services
export const useGlobalAIServices = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: aiServiceKeys.global(),
    queryFn: () => getGlobalAIServices(),
    meta: {
      errorMessage: t(
        'settings.aiService.globalSettings.errorLoading',
        'Failed to load global AI services.'
      ),
    },
  });
};

// Mutation hooks for modifying global AI services
export const useCreateGlobalAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (serviceData: Partial<AIService>) =>
      createGlobalAIService(serviceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.global() });
      // Also invalidate user services since they may see global services
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.globalSettings.successAdding',
        'Global AI service added successfully.'
      ),
      errorMessage: t(
        'settings.aiService.globalSettings.errorAdding',
        'Failed to add global AI service.'
      ),
    },
  });
};

export const useUpdateGlobalAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      serviceId,
      serviceData,
    }: {
      serviceId: string;
      serviceData: Partial<AIService>;
    }) => updateGlobalAIService(serviceId, serviceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.global() });
      // Also invalidate user services since they may see global services
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.globalSettings.successUpdating',
        'Global AI service updated successfully.'
      ),
      errorMessage: t(
        'settings.aiService.globalSettings.errorUpdating',
        'Failed to update global AI service.'
      ),
    },
  });
};

export const useDeleteGlobalAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (serviceId: string) => deleteGlobalAIService(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.global() });
      // Also invalidate user services since they may see global services
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.globalSettings.successDeleting',
        'Global AI service deleted successfully.'
      ),
      errorMessage: t(
        'settings.aiService.globalSettings.errorDeleting',
        'Failed to delete global AI service.'
      ),
    },
  });
};
