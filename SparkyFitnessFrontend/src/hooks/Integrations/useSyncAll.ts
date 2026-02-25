import { useMutation } from '@tanstack/react-query';
import { syncHevyData } from '@/api/Integrations/integrations';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from '@/hooks/Diary/useDiaryInvalidation';
import { MANUAL_SYNC_PROVIDERS } from '@/constants/integrationConstants';
import {
  handleManualSyncFitbit,
  handleManualSyncGarmin,
  handleManualSyncPolar,
  handleManualSyncStrava,
  handleManualSync,
  type DataProvider,
} from '@/api/Settings/externalProviderService';

export const useSyncAllMutation = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: async (providers: DataProvider[]) => {
      const activeSyncProviders = providers.filter(
        (p) =>
          p.is_active &&
          (MANUAL_SYNC_PROVIDERS as readonly string[]).includes(
            p.provider_type
          ) &&
          (p.provider_type === 'hevy' || p.has_token)
      );

      if (activeSyncProviders.length === 0) {
        throw new Error('NO_PROVIDERS');
      }

      let successCount = 0;
      let failCount = 0;

      for (const provider of activeSyncProviders) {
        try {
          switch (provider.provider_type) {
            case 'strava':
              await handleManualSyncStrava();
              break;
            case 'fitbit':
              await handleManualSyncFitbit();
              break;
            case 'polar':
              await handleManualSyncPolar(provider.id);
              break;
            case 'withings':
              await handleManualSync();
              break;
            case 'garmin':
              await handleManualSyncGarmin();
              break;
            case 'hevy':
              await syncHevyData(false, provider.id);
              break;
          }
          successCount++;
        } catch (err) {
          console.error(err);
          failCount++;
        }
      }

      return { successCount, failCount };
    },
    onSuccess: (data) => {
      invalidateSyncData();

      if (data.successCount > 0) {
        toast({
          title: t('common.success', 'Success'),
          description: t('sync.syncCompleted', {
            count: data.successCount,
            defaultValue: `Successfully synchronized ${data.successCount} provider(s).`,
          }),
        });
      }

      if (data.failCount > 0) {
        toast({
          title: t('common.error', 'Error'),
          description: t('sync.syncFailed', {
            count: data.failCount,
            defaultValue: `Failed to synchronize ${data.failCount} provider(s).`,
          }),
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      if (error instanceof Error && error.message === 'NO_PROVIDERS') {
        toast({
          title: t('common.info', 'Info'),
          description: t(
            'sync.noActiveProviders',
            'No active providers found to sync.'
          ),
        });
      }
    },
  });
};
