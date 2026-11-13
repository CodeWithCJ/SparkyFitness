import type {
  DeleteLabImportsResponse,
  DeleteMarkerResultsResponse,
  ImportLabReportBody,
  ImportLabReportResponse,
  LabReportScanResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { AI_TIMEOUT_MS } from '../../utils/concurrency';

const SERVICE = 'Lab Reports API';

/**
 * Reads a lab report (a PDF with a text layer, or a photo) with the user's AI
 * provider. Nothing is saved; the results come back for review.
 * POST /api/v2/lab-reports/scan
 */
export const scanLabReport = (
  document: string,
  mimeType: string
): Promise<LabReportScanResponse> =>
  apiFetch<LabReportScanResponse>({
    endpoint: '/api/v2/lab-reports/scan',
    serviceName: SERVICE,
    operation: 'scan lab report',
    method: 'POST',
    body: { document, mime_type: mimeType },
    timeoutMs: AI_TIMEOUT_MS,
    // The request is a lab report, so an error body that quotes it stays out of the log.
    logResponseBody: false,
  });

/**
 * Saves one reviewed report and all of its results together.
 * POST /api/v2/lab-results/imports
 */
export const importLabReport = (
  body: ImportLabReportBody
): Promise<ImportLabReportResponse> =>
  apiFetch<ImportLabReportResponse>({
    endpoint: '/api/v2/lab-results/imports',
    serviceName: SERVICE,
    operation: 'import lab report',
    method: 'POST',
    body,
    logResponseBody: false,
  });

/**
 * Deletes every imported report with its results, and any of your own markers
 * that leaves empty. Results you entered by hand are kept.
 * DELETE /api/v2/lab-results/imports
 */
export const deleteLabImports = (): Promise<DeleteLabImportsResponse> =>
  apiFetch<DeleteLabImportsResponse>({
    endpoint: '/api/v2/lab-results/imports',
    serviceName: SERVICE,
    operation: 'delete lab imports',
    method: 'DELETE',
  });

/**
 * Deletes every result of one built-in marker.
 * DELETE /api/v2/lab-results/entries?markerKey=
 */
export const deleteBuiltinMarkerResults = (
  markerKey: string
): Promise<DeleteMarkerResultsResponse> =>
  apiFetch<DeleteMarkerResultsResponse>({
    endpoint: `/api/v2/lab-results/entries?markerKey=${encodeURIComponent(markerKey)}`,
    serviceName: SERVICE,
    operation: 'delete built-in marker results',
    method: 'DELETE',
  });
