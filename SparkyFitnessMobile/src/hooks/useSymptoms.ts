import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listSymptomEntries, createSymptomEntry, deleteSymptomEntry, type SymptomEntry } from '../services/api/symptomsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { symptomEntriesQueryKey } from './queryKeys';
import { addLog } from '../services/LogService';
import Toast from 'react-native-toast-message';

interface UseSymptomEntriesOptions {
  fromDate: string;
  toDate: string;
  enabled?: boolean;
}

export function useSymptomEntries({ fromDate, toDate, enabled = true }: UseSymptomEntriesOptions) {
  const query = useQuery<SymptomEntry[]>({
    queryKey: symptomEntriesQueryKey(fromDate, toDate),
    queryFn: () => listSymptomEntries(fromDate, toDate),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useSymptomMutations(fromDate: string, toDate: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = symptomEntriesQueryKey(fromDate, toDate);

  const createMutation = useMutation({
    mutationFn: (body: Partial<SymptomEntry>) => createSymptomEntry(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      // Also invalidate cycle-related caches since symptoms can influence insights
      queryClient.invalidateQueries({ queryKey: ['cycleInsights'] });
    },
    onError: (err) => {
      addLog(`Failed to save symptom entry: ${err}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('symptoms.saveFailed', { defaultValue: 'Failed to save symptom' }) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSymptomEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['cycleInsights'] });
    },
    onError: (err) => {
      addLog(`Failed to remove symptom entry: ${err}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('symptoms.removeFailed', { defaultValue: 'Failed to remove symptom' }) });
    },
  });

  return {
    createEntry: createMutation.mutate,
    createEntryAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteEntry: deleteMutation.mutate,
    deleteEntryAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
