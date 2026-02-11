import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  GlobalSettings,
  globalSettingsService,
} from '@/services/globalSettingsService';
import { oidcSettingsService } from '@/services/oidcSettingsService';
import { userManagementService } from '@/services/userManagementService';
import { fetchBackupSettings } from '@/api/admin';

export const useSettings = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ['settings'],
    queryFn: () => globalSettingsService.getSettings(),
    meta: {
      errorTitle: t(
        'admin.authenticationSettings.errorLoadingSettings',
        'Error'
      ),
      errorMessage: t(
        'admin.authenticationSettings.errorLoadingSettingsDescription',
        'Failed to load authentication settings.'
      ),
    },
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: GlobalSettings) =>
      globalSettingsService.saveSettings(settings),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
};

export const useUsers = (
  searchTerm: string,
  sortBy: string,
  sortOrder: string
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ['users', { searchTerm, sortBy, sortOrder }],
    queryFn: () => userManagementService.getUsers(),
    meta: {
      errorTitle: t('admin.userManagement.error', 'Error'),
      errorMessage: t(
        'admin.userManagement.errorLoadingUsers',
        'Failed to fetch user data.'
      ),
    },
  });
};
