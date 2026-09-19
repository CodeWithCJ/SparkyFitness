import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { globalSettingsService } from '@/api/Admin/globalSettingsService';
import { mockDataKeys, settingsKeys } from '@/api/keys/admin';
import { openFoodFactsContributionKeys } from '@/api/keys/settings';
import { authClient } from '@/lib/auth-client';
import { GlobalSettings } from '@/types/admin';

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

/**
 * Whether an admin has turned on the runtime mock-data options. Available to
 * any signed-in user, because the capture/replay checkboxes live on the sync
 * dialog rather than in the admin area.
 */
export const useMockDataEnabled = () => {
  return useQuery({
    queryKey: mockDataKeys.all,
    queryFn: () => globalSettingsService.isMockDataEnabled(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  const { refetch } = authClient.useSession();
  return useMutation({
    mutationFn: (settings: GlobalSettings) =>
      globalSettingsService.saveSettings(settings),
    onSuccess: () => {
      void refetch();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
        queryClient.invalidateQueries({
          queryKey: openFoodFactsContributionKeys.all,
        }),
      ]);
    },
  });
};
