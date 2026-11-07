import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import i18n from 'i18next';
import { HttpApiError } from '@/api/api';
import * as labApi from '@/api/Labs/labResultsApi';
import { labKeys } from '@/api/keys/labs';
import type {
  CreateLabResultBody,
  ImportLabReportBody,
  UpdateLabResultBody,
} from '@workspace/shared';

export { LAB_HISTORY_LIMIT } from '@/api/Labs/labResultsApi';

// Anything that changes a result also changes the marker list (a custom marker
// appears or goes), the newest-result list and every marker's history, so the
// whole family refreshes together.
const invalidateLabs = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: labKeys.all });

export const useLabMarkers = () =>
  useQuery({
    queryKey: labKeys.markers(),
    queryFn: labApi.listLabMarkers,
    meta: {
      errorMessage: i18n.t(
        'labs.loadFailed',
        'Could not load your lab results.'
      ),
    },
  });

export const useLatestLabResults = () =>
  useQuery({
    queryKey: labKeys.latest(),
    queryFn: labApi.listLatestLabResults,
    meta: {
      errorMessage: i18n.t(
        'labs.loadFailed',
        'Could not load your lab results.'
      ),
    },
  });

/** The newest results of one marker (up to `LAB_HISTORY_LIMIT`); `marker` is `builtin:<key>` or `custom:<uuid>`. */
export const useLabHistory = (
  query: labApi.LabHistoryQuery | null,
  marker: string
) =>
  useQuery({
    queryKey: labKeys.history(marker),
    queryFn: () =>
      labApi.listLabResults({ ...query, limit: labApi.LAB_HISTORY_LIMIT }),
    enabled: query !== null,
    meta: {
      errorMessage: i18n.t(
        'labs.loadFailed',
        'Could not load your lab results.'
      ),
    },
  });

export const useSaveLabResult = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id?: string;
      body: CreateLabResultBody | UpdateLabResultBody;
    }) =>
      id
        ? labApi.updateLabResult(id, body as UpdateLabResultBody)
        : labApi.createLabResult(body as CreateLabResultBody),
    onSuccess: () => invalidateLabs(queryClient),
    meta: {
      errorMessage: i18n.t('labs.saveFailed', 'Could not save the lab result'),
    },
  });
};

export const useDeleteLabResult = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => labApi.deleteLabResult(id),
    onSuccess: () => invalidateLabs(queryClient),
    meta: {
      errorMessage: i18n.t('labs.deleteFailed', 'Could not delete the result'),
    },
  });
};

export const useDeleteLabMarker = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      marker: { markerId: string } | { markerKey: string }
    ): Promise<void> => {
      if ('markerId' in marker) {
        await labApi.deleteLabMarker(marker.markerId);
      } else {
        await labApi.deleteBuiltinMarkerResults(marker.markerKey);
      }
    },
    onSuccess: () => invalidateLabs(queryClient),
    meta: {
      errorMessage: i18n.t(
        'labs.deleteMarkerFailed',
        'Could not delete the marker'
      ),
    },
  });
};

export const useDeleteLabImports = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: labApi.deleteLabImports,
    onSuccess: () => invalidateLabs(queryClient),
    meta: {
      errorMessage: i18n.t(
        'labs.import.deleteFailed',
        'Could not delete the imported results'
      ),
    },
  });
};

/** Reads a report; the rows come back for review and nothing is saved. */
export const useScanLabReport = () =>
  useMutation({
    mutationFn: ({
      document,
      mimeType,
    }: {
      document: string;
      mimeType: string;
    }) => labApi.scanLabReport(document, mimeType),
    // No toast: the import dialog shows a failure inline, and only for the
    // report it is still showing.
    meta: { silentError: true },
  });

/**
 * Whether a failed save may still have been stored: a network error, a timeout
 * or a server error can come after the server committed. A 4xx answer means
 * the request was refused and nothing was saved.
 */
export const saveMayHaveLanded = (error: unknown): boolean =>
  !(error instanceof HttpApiError && error.status >= 400 && error.status < 500);

export const useImportLabReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportLabReportBody) => labApi.importLabReport(body),
    onSuccess: () => invalidateLabs(queryClient),
    meta: {
      errorMessage: i18n.t(
        'labs.import.saveFailed',
        'Could not save the report. Nothing was saved.'
      ),
    },
  });
};
