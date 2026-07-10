import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { syncHealthData as healthConnectSyncData } from '../services/healthConnectService';
import { saveLastSyncedTime } from '../services/storage';
import { addLog } from '../services/LogService';
import type { TimeRange } from '../services/storage';
import { serverConnectionQueryKey } from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { formatMobileNumber, mobileT } from '../localization';

interface SyncHealthDataParams {
  timeRange: TimeRange;
  healthMetricStates: Record<string, boolean>;
}

export function useSyncHealthData(options?: {
  showToasts?: boolean;
  onSuccess?: (lastSyncedTime: string | null) => void;
  onError?: (error: Error) => void;
}) {
  const { showToasts = true, onSuccess, onError } = options ?? {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ timeRange, healthMetricStates }: SyncHealthDataParams) => {
      const result = await healthConnectSyncData(timeRange, healthMetricStates);
      if (result.success) {
        // Only read errors block the cursor; server-rejected records
        // (uploadErrors) are logged and reported but never re-synced.
        const hadSyncErrors = result.syncErrors.length > 0;
        const newSyncedTime = hadSyncErrors ? null : await saveLastSyncedTime();
        return {
          lastSyncedTime: newSyncedTime,
          syncErrors: result.syncErrors,
          uploadErrors: result.uploadErrors ?? [],
        };
      }
      throw new Error(result.error || 'UNKNOWN_SYNC_ERROR');
    },
    onMutate: () => {
      if (showToasts) {
        Toast.show({
          type: 'info',
          text1: mobileT('sync.syncing'),
          visibilityTime: 2000,
        });
      }
    },
    onSuccess: (data) => {
      refreshHealthSyncCache(queryClient);
      queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
      if (showToasts) {
        if (data.syncErrors.length > 0 || data.uploadErrors.length > 0) {
          const details = [
            data.syncErrors.length > 0
              ? mobileT('sync.readErrors', {
                  count: formatMobileNumber(data.syncErrors.length),
                })
              : null,
            data.uploadErrors.length > 0
              ? mobileT('sync.uploadErrors', {
                  count: formatMobileNumber(data.uploadErrors.length),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' ');
          Toast.show({
            type: 'info',
            text1: mobileT('sync.incomplete'),
            text2: details,
            visibilityTime: 4000,
          });
        } else {
          Toast.show({
            type: 'success',
            text1: mobileT('sync.complete'),
            text2: mobileT('sync.completeDescription'),
            visibilityTime: 3000,
          });
        }
      }
      if (data.lastSyncedTime !== null) {
        onSuccess?.(data.lastSyncedTime);
      }
    },
    onError: (error: Error) => {
      addLog(`Sync Error: ${error.message}`, 'ERROR');
      if (showToasts) {
        Toast.show({
          type: 'error',
          text1: mobileT('sync.failed'),
          text2: mobileT('sync.failedDescription'),
          visibilityTime: 4000,
        });
      }
      onError?.(error);
    },
  });
}
