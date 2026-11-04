import { File } from 'expo-file-system';
import type {
  CreateSymptomDefinitionBody,
  CreateSymptomEntryBody,
  CreateSymptomOptionBody,
  EndSymptomEpisodeBody,
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomFreeDayResponse,
  SymptomOptionResponse,
  SymptomPhotoResponse,
  UpdateSymptomDefinitionBody,
  UpdateSymptomEntryBody,
} from '@workspace/shared';
import { apiFetch, normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';

export interface SymptomEntry {
  id?: string;
  user_id?: string;
  symptom_id?: string | null;
  symptom_name_snapshot: string;
  /** The medication a side-effect symptom was logged against. */
  medication_id?: string | null;
  severity: number;
  source?: string;
  entry_date: string;
  logged_at?: string;
  notes?: string | null;
}

export const listSymptomEntries = async (
  fromDate: string,
  toDate: string
): Promise<SymptomEntry[]> => {
  return apiFetch<SymptomEntry[]>({
    endpoint: `/api/v2/symptoms/entries?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    serviceName: 'Symptoms API',
    operation: 'list symptom entries',
  });
};

export const createSymptomEntry = async (
  body: Partial<SymptomEntry>
): Promise<SymptomEntry> => {
  return apiFetch<SymptomEntry>({
    endpoint: '/api/v2/symptoms/entries',
    serviceName: 'Symptoms API',
    operation: 'create symptom entry',
    method: 'POST',
    body,
  });
};

export const deleteSymptomEntry = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/symptoms/entries/${encodeURIComponent(id)}`,
    serviceName: 'Symptoms API',
    operation: 'delete symptom entry',
    method: 'DELETE',
  });
};

const SERVICE = 'Symptoms API';
const BASE = '/api/v2/symptoms';

// --- Definitions -------------------------------------------------------------

export const fetchSymptomDefinitions = (): Promise<
  SymptomDefinitionResponse[]
> =>
  apiFetch<SymptomDefinitionResponse[]>({
    endpoint: `${BASE}/custom`,
    serviceName: SERVICE,
    operation: 'list symptom definitions',
  });

export const saveSymptomDefinition = (
  body: CreateSymptomDefinitionBody
): Promise<SymptomDefinitionResponse> =>
  apiFetch<SymptomDefinitionResponse>({
    endpoint: `${BASE}/custom`,
    serviceName: SERVICE,
    operation: 'save symptom definition',
    method: 'POST',
    body,
  });

export const updateSymptomDefinition = (
  id: string,
  body: UpdateSymptomDefinitionBody
): Promise<SymptomDefinitionResponse> =>
  apiFetch<SymptomDefinitionResponse>({
    endpoint: `${BASE}/custom/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update symptom definition',
    method: 'PUT',
    body,
  });

// --- Options -----------------------------------------------------------------

export const saveSymptomOption = (
  body: CreateSymptomOptionBody
): Promise<SymptomOptionResponse> =>
  apiFetch<SymptomOptionResponse>({
    endpoint: `${BASE}/options`,
    serviceName: SERVICE,
    operation: 'save symptom option',
    method: 'POST',
    body,
  });

// --- Entries -----------------------------------------------------------------

/**
 * Entries with their treatments and photo ids, for a date range. With
 * `overlapping`, also the episodes that overlap the range without being logged
 * in it, such as one that started the month before; an older server ignores
 * it and returns only the entries logged in the range.
 */
export const fetchSymptomEntriesDetailed = (
  fromDate: string,
  toDate: string,
  { overlapping = false }: { overlapping?: boolean } = {}
): Promise<SymptomEntryResponse[]> =>
  apiFetch<SymptomEntryResponse[]>({
    endpoint: `${BASE}/entries?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}${overlapping ? '&overlapping=true' : ''}`,
    serviceName: SERVICE,
    operation: 'list symptom entries with details',
  });

export const fetchOngoingEpisodes = (): Promise<SymptomEntryResponse[]> =>
  apiFetch<SymptomEntryResponse[]>({
    endpoint: `${BASE}/entries/ongoing`,
    serviceName: SERVICE,
    operation: 'list ongoing episodes',
  });

export const fetchSymptomEntry = (id: string): Promise<SymptomEntryResponse> =>
  apiFetch<SymptomEntryResponse>({
    endpoint: `${BASE}/entries/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'get symptom entry',
  });

export const logSymptomEntry = (
  body: CreateSymptomEntryBody
): Promise<SymptomEntryResponse> =>
  apiFetch<SymptomEntryResponse>({
    endpoint: `${BASE}/entries`,
    serviceName: SERVICE,
    operation: 'log symptom entry',
    method: 'POST',
    body,
  });

export const patchSymptomEntry = (
  id: string,
  body: UpdateSymptomEntryBody
): Promise<SymptomEntryResponse> =>
  apiFetch<SymptomEntryResponse>({
    endpoint: `${BASE}/entries/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update symptom entry',
    method: 'PUT',
    body,
  });

export const endSymptomEpisode = (
  id: string,
  body: EndSymptomEpisodeBody
): Promise<SymptomEntryResponse> =>
  apiFetch<SymptomEntryResponse>({
    endpoint: `${BASE}/entries/${encodeURIComponent(id)}/end`,
    serviceName: SERVICE,
    operation: 'end symptom episode',
    method: 'POST',
    body,
  });

export const addSymptomSeverity = (
  id: string,
  severity: number
): Promise<SymptomEntryResponse> =>
  apiFetch<SymptomEntryResponse>({
    endpoint: `${BASE}/entries/${encodeURIComponent(id)}/severity`,
    serviceName: SERVICE,
    operation: 'add symptom severity reading',
    method: 'POST',
    body: { severity },
  });

// --- Symptom-free days -------------------------------------------------------

export const fetchSymptomFreeDays = (
  fromDate: string,
  toDate: string
): Promise<SymptomFreeDayResponse[]> =>
  apiFetch<SymptomFreeDayResponse[]>({
    endpoint: `${BASE}/symptom-free?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    serviceName: SERVICE,
    operation: 'list symptom-free days',
  });

export const markSymptomFreeDay = (
  entryDate: string
): Promise<SymptomFreeDayResponse> =>
  apiFetch<SymptomFreeDayResponse>({
    endpoint: `${BASE}/symptom-free`,
    serviceName: SERVICE,
    operation: 'mark symptom-free day',
    method: 'POST',
    body: { entry_date: entryDate },
  });

export const unmarkSymptomFreeDay = (entryDate: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `${BASE}/symptom-free/${encodeURIComponent(entryDate)}`,
    serviceName: SERVICE,
    operation: 'unmark symptom-free day',
    method: 'DELETE',
  });

// --- Photos ------------------------------------------------------------------

export async function uploadSymptomPhoto(params: {
  entryId: string;
  uri: string;
}): Promise<SymptomPhotoResponse> {
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);
  // Same transport guard `apiFetch` applies: these requests carry auth headers
  // and health photos, so never send them over plaintext in a release build.
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    throw new Error(
      'HTTPS is required for server connections. Please update your server URL in Settings.'
    );
  }

  const form = new FormData();
  // Global fetch is expo/fetch, which rejects React Native's `{uri, name, type}`
  // parts; expo-file-system's File implements Blob, which it serializes.
  form.append('photo', new File(params.uri));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${BASE}/entries/${encodeURIComponent(params.entryId)}/photos`,
      {
        method: 'POST',
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
          // Multer sets the multipart boundary itself, so no Content-Type.
        },
        body: form,
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch (err) {
    addLog(`[${SERVICE}] Photo upload failed without a response`, 'ERROR', [
      String(err),
    ]);
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog(`[${SERVICE}] Failed to upload photo`, 'ERROR', [text]);
    throw new ApiError(
      `Server error: ${response.status} - ${text}`,
      response.status,
      text
    );
  }
  return response.json();
}
