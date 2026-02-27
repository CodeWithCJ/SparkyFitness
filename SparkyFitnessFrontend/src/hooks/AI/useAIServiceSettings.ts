import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getAIServices,
  getPreferences,
  addAIService,
  updateAIService,
  deleteAIService,
  updateUserPreferences,
  getActiveAiServiceSetting,
  type AIService,
  type UserPreferences,
} from '@/api/Settings/aiServiceSettingsService';
import { aiServiceKeys, userPreferencesKeys } from '@/api/keys/admin';

// Query hooks for fetching data
export const useAIServices = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: aiServiceKeys.user(),
    queryFn: () => getAIServices(),
    meta: {
      errorMessage: t(
        'settings.aiService.userSettings.errorLoading',
        'Failed to load AI services.'
      ),
    },
  });
};

export const useActiveAIService = (enabled: boolean) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: aiServiceKeys.active(),
    queryFn: () => getActiveAiServiceSetting(),
    enabled,
    meta: {
      errorMessage: t(
        'settings.aiService.userSettings.errorLoading',
        'Failed to load active AI service.'
      ),
    },
  });
};

export const useUserAIPreferences = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: userPreferencesKeys.ai(),
    queryFn: () => getPreferences(),
    meta: {
      errorMessage: t(
        'settings.aiService.userSettings.errorLoadingPreferences',
        'Failed to load preferences.'
      ),
    },
  });
};

// Mutation hooks for modifying data
export const useAddAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (serviceData: Partial<AIService>) => addAIService(serviceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.userSettings.successAdding',
        'AI service added successfully.'
      ),
      errorMessage: t(
        'settings.aiService.userSettings.errorAdding',
        'Failed to add AI service.'
      ),
    },
  });
};

export const useUpdateAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      serviceId,
      serviceData,
    }: {
      serviceId: string;
      serviceData: Partial<AIService>;
    }) => updateAIService(serviceId, serviceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.userSettings.successUpdating',
        'AI service updated successfully.'
      ),
      errorMessage: t(
        'settings.aiService.userSettings.errorUpdating',
        'Failed to update AI service.'
      ),
    },
  });
};

export const useDeleteAIService = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (serviceId: string) => deleteAIService(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.user() });
      queryClient.invalidateQueries({ queryKey: aiServiceKeys.active() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.userSettings.successDeleting',
        'AI service deleted successfully.'
      ),
      errorMessage: t(
        'settings.aiService.userSettings.errorDeleting',
        'Failed to delete AI service.'
      ),
    },
  });
};

export const useUpdateUserAIPreferences = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (preferences: UserPreferences) =>
      updateUserPreferences(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userPreferencesKeys.ai() });
    },
    meta: {
      successMessage: t(
        'settings.aiService.userSettings.successUpdatingPreferences',
        'Preferences updated successfully.'
      ),
      errorMessage: t(
        'settings.aiService.userSettings.errorUpdatingPreferences',
        'Failed to update preferences.'
      ),
    },
  });
};
