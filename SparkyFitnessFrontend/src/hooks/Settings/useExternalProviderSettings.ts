import { exerciseSearchKeys } from '@/api/keys/exercises';
import {
  externalProviderKeys,
  openFoodFactsContributionKeys,
} from '@/api/keys/settings';
import {
  createExternalProvider,
  deleteExternalProvider,
  getEnrichedProviders,
  getExternalDataProviders,
  getExternalProviderTypes,
  toggleProviderActiveStatus,
  updateExternalProvider,
  getGlobalExternalProviders,
  createGlobalExternalProvider,
  updateGlobalExternalProvider,
  deleteGlobalExternalProvider,
} from '@/api/Settings/externalProviderService';
import type { CreateGlobalProviderPayload } from '@/api/Settings/externalProviderService';
export type { CreateGlobalProviderPayload };
import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const invalidateProviderConsumers = (
  queryClient: QueryClient,
  includeExerciseProviders = false
) => {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: externalProviderKeys.all }),
    queryClient.invalidateQueries({
      queryKey: openFoodFactsContributionKeys.user(),
    }),
  ];

  if (includeExerciseProviders) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: exerciseSearchKeys.providers,
      })
    );
  }

  return Promise.all(invalidations);
};

export const useExternalProviderTypesQuery = () => {
  return useQuery({
    queryKey: [...externalProviderKeys.all, 'types'],
    queryFn: getExternalProviderTypes,
    staleTime: 1000 * 60 * 60 * 24,
  });
};

export const useCreateExternalProviderMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createExternalProvider,
    onSuccess: () => invalidateProviderConsumers(queryClient),
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
    queryKey: [...externalProviderKeys.lists(), 'enriched'],
    queryFn: getEnrichedProviders,
    enabled: !!userId,
  });
};
export const useExternalProvidersQuery = () => {
  return useQuery({
    queryKey: externalProviderKeys.lists(),
    queryFn: getExternalDataProviders,
    staleTime: 1000 * 60 * 60 * 24,
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
    onSuccess: () => invalidateProviderConsumers(queryClient, true),
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
    onSuccess: () => invalidateProviderConsumers(queryClient),
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
    onSuccess: () => invalidateProviderConsumers(queryClient),
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

export const useGlobalExternalProviders = (enabled = true) => {
  return useQuery({
    queryKey: [...externalProviderKeys.all, 'global'],
    queryFn: getGlobalExternalProviders,
    enabled,
  });
};

export const useCreateGlobalProvider = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createGlobalExternalProvider,
    onSuccess: () => invalidateProviderConsumers(queryClient),
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

export const useUpdateGlobalProvider = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateGlobalProviderPayload>;
    }) => updateGlobalExternalProvider(id, data),
    onSuccess: () => invalidateProviderConsumers(queryClient, true),
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

export const useDeleteGlobalProvider = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteGlobalExternalProvider,
    onSuccess: () => invalidateProviderConsumers(queryClient),
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
