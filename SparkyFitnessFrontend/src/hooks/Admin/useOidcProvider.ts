import { oidcKeys } from '@/api/keys/admin';
import { oidcSettingsService } from '@/api/Admin/oidcSettingsService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OidcProvider } from '@/types/admin';

export const useOidcProviders = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: oidcKeys.all,
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
    mutationFn: (id: string) => oidcSettingsService.deleteProvider(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: oidcKeys.all });
    },
  });
};

export const useCreateOidcProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OidcProvider) =>
      oidcSettingsService.createProvider(provider),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: oidcKeys.all });
    },
  });
};

export const useUpdateOidcProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OidcProvider) =>
      oidcSettingsService.updateProvider(provider.id!, provider),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: oidcKeys.all });
    },
  });
};

export const useUploadOidcLogo = () => {
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      oidcSettingsService.uploadLogo(id, file),
  });
};
