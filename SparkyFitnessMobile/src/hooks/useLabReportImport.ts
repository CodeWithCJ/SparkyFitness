import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportLabReportBody } from '@workspace/shared';
import { importLabReport, scanLabReport } from '../services/api/labReportApi';
import {
  labHistoryRootQueryKey,
  labLatestQueryKey,
  labMarkersQueryKey,
} from './queryKeys';
import { ApiError } from '../services/api/errors';
import { addLog } from '../services/LogService';

// The error message can carry the server's response, which may quote the report,
// so the log gets a fixed sentence and at most the HTTP status.
const failureLog = (what: string, err: Error) =>
  `Failed to ${what}${err instanceof ApiError ? ` (HTTP ${err.statusCode})` : ''}`;

/** Reads a report; the results come back for review and nothing is saved. */
export function useScanLabReport() {
  return useMutation({
    mutationFn: ({
      document,
      mimeType,
    }: {
      document: string;
      mimeType: string;
    }) => scanLabReport(document, mimeType),
    onError: (err: Error) => {
      addLog(failureLog('scan lab report', err), 'ERROR');
    },
  });
}

/**
 * Saves the reviewed results as one report. It is all or nothing, so a failure
 * leaves nothing half saved and the review can simply be retried.
 */
export function useImportLabReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ImportLabReportBody) => importLabReport(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labMarkersQueryKey });
      queryClient.invalidateQueries({ queryKey: labLatestQueryKey });
      queryClient.invalidateQueries({ queryKey: labHistoryRootQueryKey });
    },
    onError: (err: Error) => {
      addLog(failureLog('import lab report', err), 'ERROR');
    },
  });
}
