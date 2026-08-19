import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { listCycles, createManualCycle, updateCycle, deleteCycle } from '../services/api/cycleApi';
import { addLog } from '../services/LogService';
import { cyclesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { SharedCycle } from '@workspace/shared';

export function useCycleHistory() {
  const queryClient = useQueryClient();

  const query = useQuery<SharedCycle[]>({
    queryKey: cyclesQueryKey,
    queryFn: () => listCycles(),
  });

  useRefetchOnFocus(query.refetch);

  const invalidateCaches = () => {
    queryClient.invalidateQueries({ queryKey: cyclesQueryKey });
    queryClient.invalidateQueries({ queryKey: ['cycleOverview'] });
    queryClient.invalidateQueries({ queryKey: ['cycleInsights'] });
    queryClient.invalidateQueries({ queryKey: ['cycleFertility'] });
  };

  const createMutation = useMutation({
    mutationFn: (body: Partial<SharedCycle>) => createManualCycle(body),
    onSuccess: () => {
      invalidateCaches();
      Toast.show({
        type: 'success',
        text1: i18n.t('cycleHistory.toast.success', { defaultValue: 'Success' }),
        text2: i18n.t('cycleHistory.toast.manualAdded', { defaultValue: 'Manual cycle added successfully.' }),
      });
    },
    onError: (err) => {
      addLog(`Failed to add manual cycle: ${err}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: i18n.t('cycleHistory.toast.error', { defaultValue: 'Error' }),
        text2: i18n.t('cycleHistory.toast.manualAddFailed', { defaultValue: 'Could not add manual cycle entry.' }),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SharedCycle> }) =>
      updateCycle(id, body),
    onSuccess: () => {
      invalidateCaches();
      Toast.show({
        type: 'success',
        text1: i18n.t('cycleHistory.toast.success', { defaultValue: 'Success' }),
        text2: i18n.t('cycleHistory.toast.updated', { defaultValue: 'Cycle entry updated successfully.' }),
      });
    },
    onError: (err) => {
      addLog(`Failed to update cycle entry: ${err}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: i18n.t('cycleHistory.toast.error', { defaultValue: 'Error' }),
        text2: i18n.t('cycleHistory.toast.updateFailed', { defaultValue: 'Could not update cycle entry.' }),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCycle(id),
    onSuccess: () => {
      invalidateCaches();
      Toast.show({
        type: 'success',
        text1: i18n.t('cycleHistory.toast.success', { defaultValue: 'Success' }),
        text2: i18n.t('cycleHistory.toast.deleted', { defaultValue: 'Cycle entry deleted successfully.' }),
      });
    },
    onError: (err) => {
      addLog(`Failed to delete cycle entry: ${err}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: i18n.t('cycleHistory.toast.error', { defaultValue: 'Error' }),
        text2: i18n.t('cycleHistory.toast.deleteFailed', { defaultValue: 'Could not delete cycle entry.' }),
      });
    },
  });

  return {
    cycles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createCycle: createMutation.mutate,
    createCycleAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateCycle: updateMutation.mutate,
    updateCycleAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteCycle: deleteMutation.mutate,
    deleteCycleAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
