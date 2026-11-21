import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  syncHevyData,
  syncLiftosaurData,
  syncIntervalsData,
  syncZeppBridgeData,
  type ZeppBridgeSyncResult,
} from '@/api/Integrations/integrations';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { MANUAL_SYNC_PROVIDERS } from '@/constants/integrationConstants';
import {
  handleManualSyncFitbit,
  handleManualSyncGarmin,
  handleManualSyncOura,
  handleManualSyncPolar,
  handleManualSyncCoros,
  handleManualSyncStrava,
  handleManualSync,
} from '@/api/Settings/externalProviderService';
import { DataProvider } from '@/types/settings';
import {
  useDiaryInvalidation,
  useGarminStatusInvalidation,
} from '../useInvalidateKeys';
import { externalProviderKeys } from '@/api/keys/settings';
import { garminSyncWarning } from '@/hooks/Integrations/garminSyncWarning';

export const useSyncAllMutation = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const invalidateSyncData = useDiaryInvalidation();
  const invalidateGarminStatus = useGarminStatusInvalidation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providers: DataProvider[]) => {
      const activeSyncProviders = providers.filter(
        (p) =>
          p.is_active &&
          (MANUAL_SYNC_PROVIDERS as readonly string[]).includes(
            p.provider_type
          ) &&
          (p.provider_type === 'hevy' ||
            p.provider_type === 'liftosaur' ||
            p.provider_type === 'intervals' ||
            p.provider_type === 'zeppbridge' ||
            p.provider_type === 'garmin' ||
            p.has_token)
      );

      if (activeSyncProviders.length === 0) {
        throw new Error('NO_PROVIDERS');
      }

      let successCount = 0;
      let failCount = 0;
      // A Garmin sync with failed phases still answers 200, so it is neither
      // counted as a success nor as a failure; it gets its own toast.
      let garminWarning: ReturnType<typeof garminSyncWarning> = null;
      // The last ZeppBridge sync that saved what it could but had records or
      // workout details it could not store; shown with its counts below.
      let zeppBridgeIncomplete: ZeppBridgeSyncResult | null = null;

      for (const provider of activeSyncProviders) {
        try {
          switch (provider.provider_type) {
            case 'strava':
              await handleManualSyncStrava();
              break;
            case 'fitbit':
              await handleManualSyncFitbit();
              break;
            case 'oura':
              await handleManualSyncOura();
              break;
            case 'polar':
              await handleManualSyncPolar(provider.id);
              break;
            case 'coros_mcp':
              await handleManualSyncCoros({ providerId: provider.id });
              break;
            case 'withings':
              await handleManualSync();
              break;
            case 'garmin': {
              let warning: ReturnType<typeof garminSyncWarning> = null;
              try {
                warning = garminSyncWarning(await handleManualSyncGarmin(), t);
              } finally {
                // Success, partial failure or error: the status may have moved.
                invalidateGarminStatus();
              }
              // A later clean sync must not clear an earlier warning.
              if (warning) {
                garminWarning = warning;
                continue;
              }
              break;
            }
            case 'hevy':
              await syncHevyData(false, provider.id);
              break;
            case 'liftosaur':
              await syncLiftosaurData(false, provider.id);
              queryClient.invalidateQueries({
                queryKey: externalProviderKeys.lists(),
              });
              break;
            case 'intervals':
              await syncIntervalsData(provider.id);
              queryClient.invalidateQueries({
                queryKey: externalProviderKeys.lists(),
              });
              break;
            case 'zeppbridge': {
              const result = await syncZeppBridgeData(provider.id);
              // Saved whatever it could; refresh even when some records failed.
              queryClient.invalidateQueries({
                queryKey: externalProviderKeys.lists(),
              });
              // A 200 with failed records, or workouts left without their route or
              // heart rate, is an incomplete sync, not a success.
              if (result.failed > 0 || result.workoutDetailsFailed > 0) {
                zeppBridgeIncomplete = result;
                failCount++;
                continue;
              }
              break;
            }
          }
          successCount++;
        } catch (err) {
          console.error(err);
          failCount++;
        }
      }

      return { successCount, failCount, garminWarning, zeppBridgeIncomplete };
    },
    onSuccess: (data) => {
      invalidateSyncData();

      if (data.garminWarning) {
        toast(data.garminWarning);
      }

      if (data.zeppBridgeIncomplete) {
        const zepp = data.zeppBridgeIncomplete;
        toast({
          variant: 'destructive',
          title: t(
            'integrations.zeppbridgeSyncIncompleteTitle',
            'ZeppBridge synced with problems'
          ),
          description: t(
            'integrations.zeppbridgeSyncDetails',
            'Synced: {{sleepImported}} sleep sessions, {{workoutsImported}} workouts ({{workoutDetailsImported}} with route or heart rate), {{metricDays}} days of metrics ({{failed}} failed, {{workoutDetailsFailed}} workout details missing).',
            {
              sleepImported: zepp.sleepImported ?? 0,
              workoutsImported: zepp.workoutsImported ?? 0,
              workoutDetailsImported: zepp.workoutDetailsImported ?? 0,
              workoutDetailsFailed: zepp.workoutDetailsFailed ?? 0,
              metricDays: zepp.metricDays ?? 0,
              failed: zepp.failed ?? 0,
            }
          ),
        });
      }

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
