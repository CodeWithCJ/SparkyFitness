import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { apiKeyKeys } from '@/api/keys/settings';

export const useApiKeysQuery = (userId?: string) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list();
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    meta: {
      errorMessage: t(
        'settings.apiKeyManagement.loadError',
        'Failed to load API keys'
      ),
    },
  });
};

export const useCreateApiKeyMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      name,
      expiresIn,
    }: {
      name: string;
      expiresIn?: number;
    }) => {
      const { data, error } = await authClient.apiKey.create({
        name,
        expiresIn,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() });
    },
    meta: {
      successMessage: t(
        'settings.apiKeyManagement.createSuccess',
        "New API key generated successfully! Please copy it now as it won't be shown again."
      ),
      errorMessage: t(
        'settings.apiKeyManagement.createError',
        'Failed to generate API key'
      ),
    },
  });
};

export const useDeleteApiKeyMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await authClient.apiKey.delete({ keyId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() });
    },
    meta: {
      successMessage: t(
        'settings.apiKeyManagement.deleteSuccess',
        'API key deleted successfully!'
      ),
      errorMessage: t(
        'settings.apiKeyManagement.deleteError',
        'Failed to delete API key'
      ),
    },
  });
};

export const useToggleApiKeyMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      keyId,
      enabled,
    }: {
      keyId: string;
      enabled: boolean;
    }) => {
      const { error } = await authClient.apiKey.update({ keyId, enabled });
      if (error) throw error;
      return enabled;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() });
    },
    meta: {
      successMessage: t(
        'settings.apiKeyManagement.updateSuccess',
        'API key status updated successfully!'
      ),
      errorMessage: t(
        'settings.apiKeyManagement.updateError',
        'Failed to update API key'
      ),
    },
  });
};

export const useCleanupApiKeysMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async () => {
      const { error } =
        await // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authClient.apiKey as any).deleteAllExpiredApiKeys({});
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() });
    },
    meta: {
      successMessage: t(
        'settings.apiKeyManagement.cleanupSuccess',
        'All expired API keys have been removed.'
      ),
      errorMessage: t(
        'settings.apiKeyManagement.cleanupError',
        'Failed to cleanup keys'
      ),
    },
  });
};
