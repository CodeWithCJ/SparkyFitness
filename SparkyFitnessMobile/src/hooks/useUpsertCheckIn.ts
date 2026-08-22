import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { upsertCheckIn } from '../services/api/measurementsApi';
import { measurementsQueryKey } from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { addLog } from '../services/LogService';
import type { CheckInMeasurement } from '../types/measurements';

interface UpsertCheckInVars {
  entryDate: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  bodyFatPercentage?: number | null;
}

export function useUpsertCheckIn(options?: { showErrorToast?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: UpsertCheckInVars) => upsertCheckIn(vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData<CheckInMeasurement>(
        measurementsQueryKey(vars.entryDate),
        data,
      );
      refreshHealthSyncCache(queryClient);
    },
    onError: (error) => {
      addLog(`Failed to upsert check-in: ${error}`, 'ERROR');
      // Standalone callers rely on this toast. Multi-mutation flows pass
      // showErrorToast:false so the orchestrating screen owns the single
      // user-facing error message.
      if (options?.showErrorToast !== false) {
        Toast.show({
          type: 'error',
          text1: t('checkIn.saveFailed', { defaultValue: 'Save failed' }),
          text2: t('checkIn.saveMessage', { defaultValue: 'Could not save measurements. Please try again.' }),
        });
      }
    },
  });
}
