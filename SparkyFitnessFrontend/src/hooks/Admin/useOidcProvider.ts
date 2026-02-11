import {
  OidcProvider,
  oidcSettingsService,
} from '@/services/oidcSettingsService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useOidcProviders = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ['oidc-providers'],
    queryFn: () => oidcSettingsService.getProviders(),
    meta: {
      errorTitle: t('admin.oidcSettings.error', 'Error'),
      errorMessage: t(
        'admin.oidcSettings.errorLoadingProviders',
        'Failed to fetch OIDC providers.'
      ),
    },
  });
};

export const useDeleteOidcProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => oidcSettingsService.deleteProvider(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['oidc-providers'] });
    },
  });
};

export const useCreateOidcProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OidcProvider) =>
      oidcSettingsService.createProvider(provider),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['oidc-providers'] });
    },
  });
};

export const useUpdateOidcProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OidcProvider) =>
      oidcSettingsService.updateProvider(provider.id!, provider),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['oidc-providers'] });
    },
  });
};

export const useUploadOidcLogo = () => {
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      oidcSettingsService.uploadLogo(id, file),
  });
};
