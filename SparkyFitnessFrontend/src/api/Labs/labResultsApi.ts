import { apiCall } from '@/api/api';
import type {
  CreateLabResultBody,
  DeleteLabImportsResponse,
  DeleteMarkerResultsResponse,
  ImportLabReportBody,
  ImportLabReportResponse,
  LabMarkerResponse,
  LabReportScanResponse,
  LabResultResponse,
  UpdateLabResultBody,
} from '@workspace/shared';

/** The most results one history request returns (the newest ones). */
export const LAB_HISTORY_LIMIT = 5000;

export interface LabHistoryQuery {
  markerKey?: string;
  markerId?: string;
  limit?: number;
}

export const listLabMarkers = (): Promise<LabMarkerResponse[]> =>
  apiCall('/v2/lab-results/markers', { method: 'GET' });

/** The newest result of every marker. */
export const listLatestLabResults = (): Promise<LabResultResponse[]> =>
  apiCall('/v2/lab-results/latest', { method: 'GET' });

export const listLabResults = (
  query: LabHistoryQuery
): Promise<LabResultResponse[]> =>
  apiCall('/v2/lab-results/entries', { method: 'GET', params: query });

export const createLabResult = (
  body: CreateLabResultBody
): Promise<LabResultResponse> =>
  apiCall('/v2/lab-results/entries', { method: 'POST', body });

export const updateLabResult = (
  id: string,
  body: UpdateLabResultBody
): Promise<LabResultResponse> =>
  apiCall(`/v2/lab-results/entries/${id}`, { method: 'PUT', body });

export const deleteLabResult = (id: string): Promise<void> =>
  apiCall(`/v2/lab-results/entries/${id}`, { method: 'DELETE' });

export const deleteLabMarker = (id: string): Promise<void> =>
  apiCall(`/v2/lab-results/markers/${id}`, { method: 'DELETE' });

/** Reads a report. Nothing is saved; the rows come back for review. */
export const scanLabReport = (
  document: string,
  mimeType: string
): Promise<LabReportScanResponse> =>
  apiCall('/v2/lab-reports/scan', {
    method: 'POST',
    body: { document, mime_type: mimeType },
    // The import dialog reports a failure inline for the current report only.
    suppressErrorToast: true,
  });

export const importLabReport = (
  body: ImportLabReportBody
): Promise<ImportLabReportResponse> =>
  apiCall('/v2/lab-results/imports', { method: 'POST', body });

export const deleteLabImports = (): Promise<DeleteLabImportsResponse> =>
  apiCall('/v2/lab-results/imports', { method: 'DELETE' });

export const deleteBuiltinMarkerResults = (
  markerKey: string
): Promise<DeleteMarkerResultsResponse> =>
  apiCall('/v2/lab-results/entries', {
    method: 'DELETE',
    params: { markerKey },
  });
