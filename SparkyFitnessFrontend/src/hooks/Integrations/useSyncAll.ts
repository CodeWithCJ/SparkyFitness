import { useCallback } from 'react';
import { apiCall } from '@/services/api';
import { syncHevyData } from '@/api/Integrations/integrations';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from '@/hooks/Diary/useDiaryInvalidation';
import { MANUAL_SYNC_PROVIDERS } from '@/constants/integrationConstants';
import type { DataProvider } from '@/services/externalProviderService';

export const useSyncAll = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const invalidateSyncData = useDiaryInvalidation();

  const syncAll = useCallback(
    async (providers: DataProvider[]) => {
      const activeSyncProviders = providers.filter(
        (p) =>
          p.is_active &&
          (MANUAL_SYNC_PROVIDERS as readonly string[]).includes(
            p.provider_type
          ) &&
          (p.provider_type === 'hevy' || p.has_token)
      );

      if (activeSyncProviders.length === 0) {
        toast({
          title: t('common.info', 'Info'),
          description: t(
            'sync.noActiveProviders',
            'No active providers found to sync.'
          ),
        });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const provider of activeSyncProviders) {
        try {
          switch (provider.provider_type) {
            case 'strava':
              await apiCall('/integrations/strava/sync', { method: 'POST' });
              break;
            case 'fitbit':
              await apiCall('/integrations/fitbit/sync', { method: 'POST' });
              break;
            case 'polar':
              await apiCall('/integrations/polar/sync', {
                method: 'POST',
                body: JSON.stringify({ providerId: provider.id }),
              });
              break;
            case 'withings':
              await apiCall('/withings/sync', { method: 'POST' });
              break;
            case 'garmin':
              await apiCall('/integrations/garmin/sync', { method: 'POST' });
              break;
            case 'hevy':
              await syncHevyData(false, provider.id);
              break;
          }
          successCount++;
        } catch (err) {
          console.error(`Failed to sync ${provider.provider_name}:`, err);
          failCount++;
        }
      }

      invalidateSyncData();

      if (successCount > 0) {
        toast({
          title: t('common.success', 'Success'),
          description: t('sync.syncCompleted', {
            count: successCount,
            defaultValue: `Successfully synchronized ${successCount} provider(s).`,
          }),
        });
      }

      if (failCount > 0) {
        toast({
          title: t('common.error', 'Error'),
          description: t('sync.syncFailed', {
            count: failCount,
            defaultValue: `Failed to synchronize ${failCount} provider(s).`,
          }),
          variant: 'destructive',
        });
      }
    },
    [invalidateSyncData, toast, t]
  );

  return { syncAll, invalidateSyncData };
};
