import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { listCycles, createManualCycle, updateCycle, deleteCycle } from '../services/api/cycleApi';
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
        text1: 'Success',
        text2: 'Manual cycle added successfully.',
      });
    },
    onError: (err) => {
      console.log('[useCycleHistory] Create failed:', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not add manual cycle entry.',
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
        text1: 'Success',
        text2: 'Cycle entry updated successfully.',
      });
    },
    onError: (err) => {
      console.log('[useCycleHistory] Update failed:', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update cycle entry.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCycle(id),
    onSuccess: () => {
      invalidateCaches();
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Cycle entry deleted successfully.',
      });
    },
    onError: (err) => {
      console.log('[useCycleHistory] Delete failed:', err);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not delete cycle entry.',
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
