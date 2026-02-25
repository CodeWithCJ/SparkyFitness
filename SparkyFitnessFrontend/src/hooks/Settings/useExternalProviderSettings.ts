import { externalProviderKeys } from '@/api/keys/settings';
import {
  createExternalProvider,
  deleteExternalProvider,
  getEnrichedProviders,
  toggleProviderActiveStatus,
  toggleProviderPublicSharing,
  updateExternalProvider,
} from '@/api/Settings/externalProviderService';
import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useToggleProviderPublicSharingMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      sharedWithPublic,
    }: {
      id: string;
      sharedWithPublic: boolean;
    }) => toggleProviderPublicSharing(id, sharedWithPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'providers.toggleSharingSuccess',
        'Sharing settings updated successfully.'
      ),
      errorMessage: t(
        'providers.toggleSharingError',
        'Failed to update sharing settings.'
      ),
    },
  });
};

export const useCreateExternalProviderMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createExternalProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'providers.createSuccess',
        'External data provider added successfully.'
      ),
      errorMessage: t(
        'providers.createError',
        'Failed to add external data provider.'
      ),
    },
  });
};

export const useExternalProviders = (userId?: string) => {
  return useQuery({
    queryKey: externalProviderKeys.lists(),
    queryFn: getEnrichedProviders,
    enabled: !!userId,
  });
};

export const useUpdateExternalProviderMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ExternalDataProvider>;
    }) => updateExternalProvider(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'providers.updateSuccess',
        'External data provider updated successfully'
      ),
      errorMessage: t(
        'providers.updateError',
        'Failed to update external data provider'
      ),
    },
  });
};

export const useToggleProviderStatusMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleProviderActiveStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'providers.statusUpdateSuccess',
        'External data provider status updated successfully'
      ),
      errorMessage: t(
        'providers.statusUpdateError',
        'Failed to update external data provider status'
      ),
    },
  });
};

export const useDeleteExternalProviderMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteExternalProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'providers.deleteSuccess',
        'External data provider deleted successfully'
      ),
      errorMessage: t(
        'providers.deleteError',
        'Failed to delete external data provider'
      ),
    },
  });
};
