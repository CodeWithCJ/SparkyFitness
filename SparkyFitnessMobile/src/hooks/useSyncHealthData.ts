import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { syncHealthData as healthConnectSyncData } from '../services/healthConnectService';
import { saveLastSyncedTime } from '../services/storage';
import { addLog } from '../services/LogService';
import type { TimeRange } from '../services/storage';
import { serverConnectionQueryKey } from './queryKeys';

interface SyncHealthDataParams {
  timeRange: TimeRange;
  healthMetricStates: Record<string, boolean>;
}

export function useSyncHealthData(options?: {
  showAlerts?: boolean;
  onSuccess?: (lastSyncedTime: string | null) => void;
  onError?: (error: Error) => void;
}) {
  const { showAlerts = true, onSuccess, onError } = options ?? {};
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
      if (showAlerts) {
        Alert.alert('Success', 'Health data synced successfully.');
      }
      onSuccess?.(data.lastSyncedTime);
    },
    onError: (error: Error) => {
      addLog(`Sync Error: ${error.message}`, 'ERROR');
      if (showAlerts) {
        Alert.alert('Sync Error', error.message);
      }
      onError?.(error);
    },
  });
}
