import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  CreateSymptomDefinitionBody,
  CreateSymptomEntryBody,
  CreateSymptomOptionBody,
  EndSymptomEpisodeBody,
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomFreeDayResponse,
  UpdateSymptomDefinitionBody,
  UpdateSymptomEntryBody,
} from '@workspace/shared';
import {
  listSymptomEntries,
  createSymptomEntry,
  deleteSymptomEntry,
  fetchSymptomDefinitions,
  saveSymptomDefinition,
  updateSymptomDefinition,
  saveSymptomOption,
  fetchSymptomEntriesDetailed,
  fetchOngoingEpisodes,
  fetchSymptomEntry,
  logSymptomEntry,
  patchSymptomEntry,
  endSymptomEpisode,
  addSymptomSeverity,
  fetchSymptomFreeDays,
  markSymptomFreeDay,
  unmarkSymptomFreeDay,
  uploadSymptomPhoto,
  type SymptomEntry,
} from '../services/api/symptomsApi';
import {
  scheduleOngoingEpisodeNudge,
  cancelOngoingEpisodeNudge,
} from '../services/symptomReminderService';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import {
  symptomDefinitionsQueryKey,
  symptomEntriesDetailedQueryKey,
  symptomEntriesQueryKey,
  symptomEntriesRootQueryKey,
  symptomFreeDaysQueryKey,
  symptomOngoingQueryKey,
  symptomOptionsQueryKey,
} from './queryKeys';
import { addLog } from '../services/LogService';
import Toast from 'react-native-toast-message';

interface UseSymptomEntriesOptions {
  fromDate: string;
  toDate: string;
  enabled?: boolean;
}

export function useSymptomEntries({
  fromDate,
  toDate,
  enabled = true,
}: UseSymptomEntriesOptions) {
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
      Toast.show({
        type: 'error',
        text1: t('symptoms.saveFailed', {
          defaultValue: 'Failed to save symptom',
        }),
      });
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
      Toast.show({
        type: 'error',
        text1: t('symptoms.removeFailed', {
          defaultValue: 'Failed to remove symptom',
        }),
      });
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

// --- Generic symptom tracking ------------------------------------------------

/**
 * Everything that reads an entry has to refresh when one changes: every cached
 * date range, the ongoing-episode banner, and the cycle hub, which reads
 * cycle-source entries from the same table.
 */
const invalidateEntries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: symptomEntriesRootQueryKey });
  queryClient.invalidateQueries({ queryKey: symptomOngoingQueryKey });
  queryClient.invalidateQueries({ queryKey: ['symptoms', 'entry'] });
  queryClient.invalidateQueries({ queryKey: ['cycleInsights'] });
};

export function useSymptomDefinitions() {
  const query = useQuery<SymptomDefinitionResponse[]>({
    queryKey: symptomDefinitionsQueryKey,
    queryFn: fetchSymptomDefinitions,
  });
  return { definitions: query.data ?? [], isLoading: query.isLoading };
}

export function useOngoingEpisodes(enabled = true) {
  const query = useQuery<SymptomEntryResponse[]>({
    queryKey: symptomOngoingQueryKey,
    queryFn: fetchOngoingEpisodes,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return { episodes: query.data ?? [], isLoading: query.isLoading };
}

export function useSymptomEntriesDetailed({
  fromDate,
  toDate,
  overlapping = false,
  enabled = true,
}: {
  fromDate: string;
  toDate: string;
  /** Also the episodes that overlap the range without being logged in it. */
  overlapping?: boolean;
  enabled?: boolean;
}) {
  const query = useQuery<SymptomEntryResponse[]>({
    queryKey: symptomEntriesDetailedQueryKey(fromDate, toDate, overlapping),
    queryFn: () =>
      fetchSymptomEntriesDetailed(fromDate, toDate, { overlapping }),
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useSymptomEntry(id: string | null | undefined) {
  const query = useQuery<SymptomEntryResponse>({
    queryKey: ['symptoms', 'entry', id],
    queryFn: () => fetchSymptomEntry(id!),
    enabled: Boolean(id),
  });
  return { entry: query.data ?? null, isLoading: query.isLoading };
}

export function useSymptomFreeDays({
  fromDate,
  toDate,
  enabled = true,
}: {
  fromDate: string;
  toDate: string;
  enabled?: boolean;
}) {
  const query = useQuery<SymptomFreeDayResponse[]>({
    queryKey: symptomFreeDaysQueryKey(fromDate, toDate),
    queryFn: () => fetchSymptomFreeDays(fromDate, toDate),
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return { freeDays: query.data ?? [], isLoading: query.isLoading };
}

/** The actions the symptom screens take, each refreshing what depends on it. */
export function useSymptomActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const onError = (message: string) => (err: unknown) => {
    addLog(`${message}: ${err}`, 'ERROR');
    Toast.show({ type: 'error', text1: message });
  };

  const saveDefinition = useMutation({
    mutationFn: (body: CreateSymptomDefinitionBody) =>
      saveSymptomDefinition(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomDefinitionsQueryKey }),
    onError: onError(
      t('symptoms.saveDefinitionFailed', {
        defaultValue: 'Could not save the symptom',
      })
    ),
  });

  const updateDefinition = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateSymptomDefinitionBody;
    }) => updateSymptomDefinition(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomDefinitionsQueryKey }),
    onError: onError(
      t('symptoms.saveDefinitionFailed', {
        defaultValue: 'Could not save the symptom',
      })
    ),
  });

  const saveOption = useMutation({
    mutationFn: (body: CreateSymptomOptionBody) => saveSymptomOption(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomOptionsQueryKey }),
    onError: onError(
      t('symptoms.saveOptionFailed', {
        defaultValue: 'Could not save the option',
      })
    ),
  });

  const logEntry = useMutation({
    mutationFn: (body: CreateSymptomEntryBody) => logSymptomEntry(body),
    onSuccess: (data) => {
      invalidateEntries(queryClient);
      if (data?.id && data.started_at && !data.ended_at) {
        void scheduleOngoingEpisodeNudge(
          data.id,
          data.symptom_name_snapshot ?? 'Symptom',
          data.started_at
        );
      }
    },
    onError: onError(
      t('symptoms.saveFailed', { defaultValue: 'Failed to save symptom' })
    ),
  });

  const updateEntry = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSymptomEntryBody }) =>
      patchSymptomEntry(id, body),
    onSuccess: (data) => {
      invalidateEntries(queryClient);
      if (data?.id && data.ended_at) {
        void cancelOngoingEpisodeNudge(data.id);
      }
    },
    onError: onError(
      t('symptoms.updateFailed', {
        defaultValue: 'Could not update the symptom log',
      })
    ),
  });

  const endEpisode = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EndSymptomEpisodeBody }) =>
      endSymptomEpisode(id, body),
    onSuccess: (_data, variables) => {
      invalidateEntries(queryClient);
      void cancelOngoingEpisodeNudge(variables.id);
    },
    onError: onError(
      t('symptoms.endFailed', { defaultValue: 'Could not end the episode' })
    ),
  });

  const addSeverity = useMutation({
    mutationFn: ({ id, severity }: { id: string; severity: number }) =>
      addSymptomSeverity(id, severity),
    onSuccess: () => invalidateEntries(queryClient),
    onError: onError(
      t('symptoms.severityFailed', {
        defaultValue: 'Could not update severity',
      })
    ),
  });

  const removeEntry = useMutation({
    mutationFn: (id: string) => deleteSymptomEntry(id),
    onSuccess: (_data, id) => {
      invalidateEntries(queryClient);
      void cancelOngoingEpisodeNudge(id);
    },
    onError: onError(
      t('symptoms.removeFailed', { defaultValue: 'Failed to remove symptom' })
    ),
  });

  const markFree = useMutation({
    mutationFn: (entryDate: string) => markSymptomFreeDay(entryDate),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['symptomFreeDays'] }),
    onError: onError(
      t('symptoms.freeFailed', {
        defaultValue: 'Could not update symptom-free status',
      })
    ),
  });

  const unmarkFree = useMutation({
    mutationFn: (entryDate: string) => unmarkSymptomFreeDay(entryDate),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['symptomFreeDays'] }),
    onError: onError(
      t('symptoms.freeFailed', {
        defaultValue: 'Could not update symptom-free status',
      })
    ),
  });

  const uploadPhoto = useMutation({
    mutationFn: (params: { entryId: string; uri: string }) =>
      uploadSymptomPhoto(params),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomEntriesRootQueryKey }),
    onError: onError(
      t('symptoms.photoFailed', { defaultValue: 'Could not upload the photo' })
    ),
  });

  return {
    saveDefinition,
    updateDefinition,
    saveOption,
    logEntry,
    updateEntry,
    endEpisode,
    addSeverity,
    removeEntry,
    markFree,
    unmarkFree,
    uploadPhoto,
  };
}
