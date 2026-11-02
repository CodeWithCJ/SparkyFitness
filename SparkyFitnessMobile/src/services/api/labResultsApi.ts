import type { LabMarkerResponse, LabResultResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

/** Which marker a result belongs to: a built-in key or a custom marker id. */
export type LabMarkerQuery = { markerKey: string } | { markerId: string };

export interface NewLabMarkerPayload {
  name: string;
  unit: string;
  ref_range_low: number | null;
  ref_range_high: number | null;
}

export interface NewLabResultPayload {
  marker_key?: string;
  custom_marker_id?: string;
  entry_date: string;
  value_numeric: number;
  unit: string;
  ref_range_low: number | null;
  ref_range_high: number | null;
  notes?: string;
}

const SERVICE = 'Lab Results API';

export const fetchLabMarkers = (): Promise<LabMarkerResponse[]> =>
  apiFetch<LabMarkerResponse[]>({
    endpoint: '/api/v2/lab-results/markers',
    serviceName: SERVICE,
    operation: 'fetch lab markers',
  });

export const fetchLatestLabResults = (): Promise<LabResultResponse[]> =>
  apiFetch<LabResultResponse[]>({
    endpoint: '/api/v2/lab-results/latest',
    serviceName: SERVICE,
    operation: 'fetch latest lab results',
  });

/** Every result of one marker, newest first. */
export const fetchLabResults = (
  marker: LabMarkerQuery
): Promise<LabResultResponse[]> => {
  const filter =
    'markerKey' in marker
      ? `markerKey=${encodeURIComponent(marker.markerKey)}`
      : `markerId=${encodeURIComponent(marker.markerId)}`;
  return apiFetch<LabResultResponse[]>({
    endpoint: `/api/v2/lab-results/entries?${filter}&limit=1000`,
    serviceName: SERVICE,
    operation: 'fetch lab results',
  });
};

export const createLabMarker = (
  body: NewLabMarkerPayload
): Promise<LabMarkerResponse> =>
  apiFetch<LabMarkerResponse>({
    endpoint: '/api/v2/lab-results/markers',
    serviceName: SERVICE,
    operation: 'create lab marker',
    method: 'POST',
    body,
  });

export const createLabResult = (
  body: NewLabResultPayload
): Promise<LabResultResponse> =>
  apiFetch<LabResultResponse>({
    endpoint: '/api/v2/lab-results/entries',
    serviceName: SERVICE,
    operation: 'create lab result',
    method: 'POST',
    body,
  });

export const deleteLabResult = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/lab-results/entries/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete lab result',
    method: 'DELETE',
  });
