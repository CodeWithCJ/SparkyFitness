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
  
  // Extract filename and mime type from URI
  const filename = uri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  form.append('photo', {
    uri,
    name: filename,
    type,
  } as any);
  form.append('pregnancy_id', pregnancyId);
  form.append('week', String(week));
  if (notes) {
    form.append('notes', notes);
  }

  const response = await fetchWithTimeout(`${baseUrl}/api/v2/pregnancy/photos`, {
    method: 'POST',
    headers: {
      ...proxyHeadersToRecord(config.proxyHeaders),
      ...getAuthHeaders(config),
      // Note: Multer needs to set the boundary, so do NOT set Content-Type header manually.
    },
    body: form,
  }, UPLOAD_TIMEOUT_MS);

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
