import { File } from 'expo-file-system';
import { apiFetch, normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
import type { BumpPhoto } from '../../types/womensHealth';

export const listPhotos = async (pregnancyId: string): Promise<BumpPhoto[]> => {
  return apiFetch<BumpPhoto[]>({
    endpoint: `/api/v2/pregnancy/photos?pregnancy_id=${encodeURIComponent(pregnancyId)}`,
    serviceName: 'Pregnancy Photos API',
    operation: 'list photos',
  });
};

export const deletePhoto = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/pregnancy/photos/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy Photos API',
    operation: 'delete photo',
    method: 'DELETE',
  });
};

export async function uploadPhoto(params: {
  pregnancyId: string;
  week: number;
  uri: string;
  notes?: string;
}): Promise<BumpPhoto> {
  const { pregnancyId, week, uri, notes } = params;

  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);

  const form = new FormData();

  // Text fields must precede the file part: multer only reliably exposes
  // fields that arrive before the file in the multipart stream.
  form.append('pregnancy_id', pregnancyId);
  form.append('week', String(week));
  if (notes) {
    form.append('notes', notes);
  }
  // Global fetch is expo/fetch (WinterCG) under Expo's winter runtime, which
  // rejects React Native's `{uri, name, type}` FormData parts with
  // "Unsupported FormDataPart implementation". expo-file-system's File
  // implements Blob, which expo/fetch serializes correctly.
  form.append('photo', new File(uri));

  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/api/v2/pregnancy/photos`, {
      method: 'POST',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
        // Note: Multer needs to set the boundary, so do NOT set Content-Type header manually.
      },
      body: form,
    }, UPLOAD_TIMEOUT_MS);
  } catch (err) {
    // A throw here means no response ever arrived (connection dropped,
    // timeout, or a proxy rejecting the multipart body before the app server
    // saw it), so log it; the response-error path below can't.
    addLog('[Pregnancy Photos API] Photo upload failed without a response', 'ERROR', [String(err)]);
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Pregnancy Photos API] Failed to upload photo', 'ERROR', [text]);
    throw new ApiError(`Server error: ${response.status} - ${text}`, response.status, text);
  }

  return response.json();
}
