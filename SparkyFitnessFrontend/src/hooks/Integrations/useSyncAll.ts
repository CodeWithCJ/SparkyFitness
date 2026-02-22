import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiCall } from '@/services/api';
import { syncHevyData } from '@/api/Integrations/integrations';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { dailyProgressKeys, foodEntryKeys } from '@/api/keys/diary';
import { checkInKeys, sleepKeys } from '@/api/keys/checkin';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type: string;
  is_active: boolean;
  has_token?: boolean;
}

export const useSyncAll = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const invalidateSyncData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    queryClient.invalidateQueries({ queryKey: sleepKeys.all });
  }, [queryClient]);

  const syncAll = useCallback(async (providers: ExternalDataProvider[]) => {
    const activeSyncProviders = providers.filter(
      (p) =>
        p.is_active &&
        ['strava', 'fitbit', 'polar', 'withings', 'garmin', 'hevy'].includes(
          p.provider_type
        ) &&
        (p.provider_type === 'hevy' || p.has_token)
    );

    if (activeSyncProviders.length === 0) {
      toast({
        title: t('common.info', 'Info'),
        description: t('sync.noActiveProviders', 'No active providers found to sync.'),
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
  }, [invalidateSyncData, toast, t]);

  return { syncAll, invalidateSyncData };
};
