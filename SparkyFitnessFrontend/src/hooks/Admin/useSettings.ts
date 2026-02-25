import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  GlobalSettings,
  globalSettingsService,
} from '@/api/Admin/globalSettingsService';
import { settingsKeys } from '@/api/keys/admin';
import { authClient } from '@/lib/auth-client';

export const useSettings = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: settingsKeys.all,
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

  const { refetch } = authClient.useSession();
  return useMutation({
    mutationFn: (settings: GlobalSettings) =>
      globalSettingsService.saveSettings(settings),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
};
