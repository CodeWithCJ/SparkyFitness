import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  CreateShoeBody,
  ShoeStatus,
  UpdateShoeBody,
} from '@workspace/shared';
import {
  assignShoeToExerciseEntry,
  createShoe,
  deleteShoe,
  fetchShoes,
  updateShoe,
} from '../services/api/shoesApi';
import { addLog } from '../services/LogService';
import { exerciseStatsQueryKeyRoot, shoesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useShoes(status?: ShoeStatus) {
  const query = useQuery({
    queryKey: [...shoesQueryKey, status ?? 'all'],
    queryFn: () => fetchShoes(status),
  });

  useRefetchOnFocus(query.refetch);

  return {
    shoes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useShoeMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...shoesQueryKey] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateShoeBody) => createShoe(data),
    onSuccess: refresh,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShoeBody }) =>
      updateShoe(id, data),
    onSuccess: refresh,
    // Shared by every caller (save, retire, reactivate), so none of them needs
    // its own failure feedback.
    onError: (error) => {
      addLog('Failed to update shoe', 'ERROR', [String(error)]);
      Toast.show({
        type: 'error',
        text1: t('shoes.updateFailed', {
          defaultValue: 'Failed to update shoe',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShoe(id),
    onSuccess: () => {
      refresh();
      // Entries keep their data but lose the link.
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}

export function useAssignShoe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseEntryId,
      shoeId,
    }: {
      exerciseEntryId: string;
      shoeId: string | null;
    }) => assignShoeToExerciseEntry(exerciseEntryId, shoeId),
    onSuccess: () => {
      // Mileage is derived from the linked entries.
      void queryClient.invalidateQueries({ queryKey: [...shoesQueryKey] });
      void queryClient.invalidateQueries({
        queryKey: ['cardioSessionDetail'],
      });
      void queryClient.invalidateQueries({
        queryKey: [...exerciseStatsQueryKeyRoot],
      });
    },
  });
}
