import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { putLog, deleteLog } from '../services/api/cycleApi';
import { addLog } from '../services/LogService';
import {
  cycleLogQueryKey,
  cyclesQueryKey,
  cycleOverviewQueryKey,
  cycleInsightsQueryKey,
  cycleFertilityQueryKey,
} from './queryKeys';
import type { SharedCycleDailyLog } from '@workspace/shared';

interface UpsertCycleLogVars {
  date: string;
  body: Parameters<typeof putLog>[1];
}

export function useUpsertCycleLog() {
  const queryClient = useQueryClient();

  const invalidateCaches = (date: string) => {
    queryClient.invalidateQueries({ queryKey: cycleLogQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: ['cycleLogsRange'] });
    queryClient.invalidateQueries({ queryKey: cyclesQueryKey });
    queryClient.invalidateQueries({ queryKey: cycleOverviewQueryKey });
    queryClient.invalidateQueries({ queryKey: cycleInsightsQueryKey });
    queryClient.invalidateQueries({ queryKey: cycleFertilityQueryKey });
  };

  const upsertMutation = useMutation({
    mutationFn: (vars: UpsertCycleLogVars) => putLog(vars.date, vars.body),
    onSuccess: (data, vars) => {
      queryClient.setQueryData<SharedCycleDailyLog>(cycleLogQueryKey(vars.date), data);
      invalidateCaches(vars.date);
      Toast.show({
        type: 'success',
        text1: 'Saved',
        text2: 'Daily log updated successfully.',
      });
    },
    onError: (error) => {
      addLog(`Failed to save cycle daily log: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: 'Could not save log entry. Please try again.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (date: string) => deleteLog(date),
    onSuccess: (_, date) => {
      queryClient.setQueryData(cycleLogQueryKey(date), null);
      invalidateCaches(date);
      Toast.show({
        type: 'success',
        text1: 'Deleted',
        text2: 'Daily log cleared.',
      });
    },
    onError: (error) => {
      addLog(`Failed to delete cycle daily log: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: 'Delete failed',
        text2: 'Could not clear log entry. Please try again.',
      });
    },
  });

  return {
    upsertLog: upsertMutation.mutate,
    upsertLogAsync: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
    deleteLog: deleteMutation.mutate,
    deleteLogAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
