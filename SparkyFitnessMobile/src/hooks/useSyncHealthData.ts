import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { syncHealthData as healthConnectSyncData } from '../services/healthConnectService';
import { saveLastSyncedTime } from '../services/storage';
import { addLog } from '../services/LogService';
import type { TimeRange } from '../services/storage';
import { serverConnectionQueryKey } from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';

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
        const newSyncedTime = await saveLastSyncedTime();
        return { lastSyncedTime: newSyncedTime };
      }
      throw new Error(result.error || 'Unknown sync error');
    },
    onMutate: () => {
      if (showToasts) {
        Toast.show({
          type: 'info',
          text1: 'Syncing health data…',
          visibilityTime: 2000,
        });
      }
    },
    onSuccess: (data) => {
      refreshHealthSyncCache(queryClient);
      queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
      if (showToasts) {
        Toast.show({
          type: 'success',
          text1: 'Sync complete',
          text2: 'Health data synced successfully.',
          visibilityTime: 3000,
        });
      }
      onSuccess?.(data.lastSyncedTime);
    },
    onError: (error: Error) => {
      addLog(`Sync Error: ${error.message}`, 'ERROR');
      if (showToasts) {
        Toast.show({
          type: 'error',
          text1: 'Sync Error',
          text2: error.message,
          visibilityTime: 4000,
        });
      }
      onError?.(error);
    },
  });
}
