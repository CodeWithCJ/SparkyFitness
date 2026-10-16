import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as symptomService from '@/api/Symptoms/symptomService';
import type { SymptomEntryFilters } from '@/api/Symptoms/symptomService';
import { reportKeys } from '@/api/keys/reports';
import type {
  CreateSymptomDefinitionBody,
  CreateSymptomEntryBody,
  CreateSymptomOptionBody,
  EndSymptomEpisodeBody,
  SymptomOptionKind,
  UpdateSymptomDefinitionBody,
  UpdateSymptomEntryBody,
} from '@workspace/shared';

import i18n from 'i18next';
const symptomKeys = {
  definitions: () => ['custom-symptoms'] as const,
  options: (kind?: SymptomOptionKind) =>
    ['symptom-options', kind ?? 'all'] as const,
  entries: (filters?: SymptomEntryFilters) =>
    ['symptom-entries', filters ?? {}] as const,
  ongoing: () => ['symptom-ongoing'] as const,
  freeDays: (range?: { fromDate?: string; toDate?: string }) =>
    ['symptom-free-days', range ?? {}] as const,
};

// Anything that changes an entry has to refresh the whole family of views that
// read it: the history lists and calendars, the ongoing-episode banner, the
// medication report bundle (keyed under reportKeys.all, a different namespace,
// so it never refreshes on its own; refetchType 'all' also updates it while
// Reports is not mounted), and the cycle hub, which reads cycle-source entries.
const invalidateEntryFamily = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({
    queryKey: ['symptom-entries'],
    refetchType: 'all',
  });
  queryClient.invalidateQueries({ queryKey: symptomKeys.ongoing() });
  queryClient.invalidateQueries({ queryKey: ['symptom-context'] });
  queryClient.invalidateQueries({ queryKey: ['cycle-insights'] });
  queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
  queryClient.invalidateQueries({ queryKey: ['cycle-correlations'] });
  queryClient.invalidateQueries({
    queryKey: reportKeys.all,
    refetchType: 'all',
  });
};

// --- Queries ---------------------------------------------------------------

export const useCustomSymptoms = () =>
  useQuery({
    queryKey: symptomKeys.definitions(),
    queryFn: () => symptomService.listSymptomDefinitions(),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadYourSymptoms',
        'Failed to load your symptoms.'
      ),
    },
  });

export const useSymptomOptions = (kind?: SymptomOptionKind) =>
  useQuery({
    queryKey: symptomKeys.options(kind),
    queryFn: () => symptomService.listSymptomOptions(kind),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadSymptomOptions',
        'Failed to load symptom options.'
      ),
    },
  });

export const useSymptomEntries = (filters?: SymptomEntryFilters) =>
  useQuery({
    queryKey: symptomKeys.entries(filters),
    queryFn: () => symptomService.listSymptomEntries(filters),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadSymptomLogs',
        'Failed to load symptom logs.'
      ),
    },
  });

export const useOngoingEpisodes = () =>
  useQuery({
    queryKey: symptomKeys.ongoing(),
    queryFn: () => symptomService.listOngoingEpisodes(),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadOngoingEpisodes',
        'Failed to load ongoing episodes.'
      ),
    },
  });

/** The diary around the given entries, keyed by entry id. */
export const useSymptomContext = (ids: string[]) =>
  useQuery({
    queryKey: ['symptom-context', ids] as const,
    queryFn: async () => {
      const list = await symptomService.getSymptomContext(ids);
      return Object.fromEntries(list.map((c) => [c.entry_id, c]));
    },
    enabled: ids.length > 0,
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadTheDiary',
        'Failed to load the diary around these episodes.'
      ),
    },
  });

export const useSymptomFreeDays = (range?: {
  fromDate?: string;
  toDate?: string;
}) =>
  useQuery({
    queryKey: symptomKeys.freeDays(range),
    queryFn: () => symptomService.listSymptomFreeDays(range),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.failedToLoadSymptomFree',
        'Failed to load symptom-free days.'
      ),
    },
  });

// --- Definition mutations --------------------------------------------------

export const useCreateCustomSymptomMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSymptomDefinitionBody) =>
      symptomService.createSymptomDefinition(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomKeys.definitions() }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotSaveSymptom',
        'Could not save symptom.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.symptomSaved',
        'Symptom saved.'
      ),
    },
  });
};

export const useUpdateCustomSymptomMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateSymptomDefinitionBody;
    }) => symptomService.updateSymptomDefinition(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomKeys.definitions() }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotUpdateSymptom',
        'Could not update symptom.'
      ),
    },
  });
};

export const useDeleteCustomSymptomMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteSymptomDefinition(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomKeys.definitions() }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotDeleteSymptom',
        'Could not delete symptom.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.symptomDeletedYourPastLogs',
        'Symptom deleted. Your past logs are kept.'
      ),
    },
  });
};

// --- Option mutations ------------------------------------------------------

const invalidateOptions = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['symptom-options'] });

export const useCreateSymptomOptionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSymptomOptionBody) =>
      symptomService.createSymptomOption(body),
    onSuccess: () => invalidateOptions(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotSaveOption',
        'Could not save option.'
      ),
    },
  });
};

export const useDeleteSymptomOptionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteSymptomOption(id),
    onSuccess: () => invalidateOptions(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotRemoveOption',
        'Could not remove option.'
      ),
    },
  });
};

// --- Entry mutations -------------------------------------------------------

export const useCreateSymptomEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSymptomEntryBody) =>
      symptomService.createSymptomEntry(body),
    onSuccess: () => invalidateEntryFamily(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotLogSymptom',
        'Could not log symptom.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.symptomLogged',
        'Symptom logged.'
      ),
    },
  });
};

export const useUpdateSymptomEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSymptomEntryBody }) =>
      symptomService.updateSymptomEntry(id, body),
    onSuccess: () => invalidateEntryFamily(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotUpdateSymptomLog',
        'Could not update symptom log.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.symptomLogUpdated',
        'Symptom log updated.'
      ),
    },
  });
};

export const useEndEpisodeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EndSymptomEpisodeBody }) =>
      symptomService.endSymptomEpisode(id, body),
    onSuccess: () => invalidateEntryFamily(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotEndTheEpisode',
        'Could not end the episode.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.episodeEnded',
        'Episode ended.'
      ),
    },
  });
};

export const useAddSeverityMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, severity }: { id: string; severity: number }) =>
      symptomService.addSymptomSeverity(id, severity),
    onSuccess: () => invalidateEntryFamily(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotUpdateSeverity',
        'Could not update severity.'
      ),
    },
  });
};

export const useDeleteSymptomEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteSymptomEntry(id),
    onSuccess: () => invalidateEntryFamily(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotRemoveSymptomLog',
        'Could not remove symptom log.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.symptomLogRemoved',
        'Symptom log removed.'
      ),
    },
  });
};

// --- Symptom-free days -----------------------------------------------------

const invalidateFreeDays = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['symptom-free-days'] });

export const useMarkSymptomFreeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryDate: string) =>
      symptomService.markSymptomFree(entryDate),
    onSuccess: () => invalidateFreeDays(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotSaveThat',
        'Could not save that.'
      ),
      successMessage: i18n.t(
        'hooks.useSymptoms.markedAsASymptomFree',
        'Marked as a symptom-free day.'
      ),
    },
  });
};

export const useUnmarkSymptomFreeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryDate: string) =>
      symptomService.unmarkSymptomFree(entryDate),
    onSuccess: () => invalidateFreeDays(queryClient),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotUndoThat',
        'Could not undo that.'
      ),
    },
  });
};

// --- Photos ----------------------------------------------------------------

export const useUploadSymptomPhotoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, file }: { entryId: string; file: File }) =>
      symptomService.uploadSymptomPhoto(entryId, file),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['symptom-entries'],
        refetchType: 'all',
      }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotUploadThePhoto',
        'Could not upload the photo.'
      ),
    },
  });
};

export const useDeleteSymptomPhotoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => symptomService.deleteSymptomPhoto(photoId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['symptom-entries'],
        refetchType: 'all',
      }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useSymptoms.couldNotRemoveThePhoto',
        'Could not remove the photo.'
      ),
    },
  });
};
