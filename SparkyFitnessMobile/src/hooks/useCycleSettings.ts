import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { getSettings, putSettings } from '../services/api/cycleApi';
import { cycleSettingsQueryKey } from './queryKeys';
import { addLog } from '../services/LogService';
import type { SharedCycleSettings } from '../types/womensHealth';

export function useCycleSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: cycleSettingsQueryKey,
    queryFn: getSettings,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (
      body: Partial<SharedCycleSettings> & {
        mark_onboarded?: boolean;
        reset_onboarding?: boolean;
      }
    ) => putSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData<SharedCycleSettings | null>(cycleSettingsQueryKey, data);
    },
    onError: (error) => {
      addLog(`Failed to update cycle settings: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: 'Could not save cycle settings. Please try again.',
      });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateSettings: mutation.mutate,
    updateSettingsAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
