import { File } from 'expo-file-system';
import { apiFetch, normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
import type {
  CheckInPhoto,
  CheckInPhotoWithWeight,
  PhotoType,
} from '../../types/checkInPhotos';

const SERVICE = 'Check-In Photos API';

/**
 * Every progress photo with the weight logged that day, newest first. One
 * request backs the gallery, the comparison and the time-lapse player.
 */
export const fetchPhotoGallery = async (): Promise<
  CheckInPhotoWithWeight[]
> => {
  return apiFetch<CheckInPhotoWithWeight[]>({
    endpoint: '/api/measurements/check-in-photos',
    serviceName: SERVICE,
    operation: 'fetch photo gallery',
  });
};

/**
 * The calendar days that have at least one photo, newest first. Marks those
 * days in the date pickers without pulling the whole gallery.
 */
export const fetchPhotoDates = async (): Promise<string[]> => {
  return apiFetch<string[]>({
    endpoint: '/api/measurements/check-in-photos/dates',
    serviceName: SERVICE,
    operation: 'fetch photo dates',
  });
};

/** The photos taken on one calendar day. */
export const fetchPhotosByDate = async (
  date: string
): Promise<CheckInPhoto[]> => {
  return apiFetch<CheckInPhoto[]>({
    endpoint: `/api/measurements/check-in-photos/${encodeURIComponent(date)}`,
    serviceName: SERVICE,
    operation: 'fetch photos by date',
  });
};

export const deletePhoto = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/measurements/check-in-photos/photo/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete photo',
    method: 'DELETE',
  });
};

/**
 * Uploads one angle for one day, replacing whatever was there before (the
 * server upserts on user + date + type).
 */
export async function uploadPhoto(params: {
  date: string;
  type: PhotoType;
  uri: string;
}): Promise<CheckInPhoto> {
  const { date, type, uri } = params;

  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);

  const form = new FormData();
  // Global fetch is expo/fetch (WinterCG), which rejects React Native's
  // `{uri, name, type}` FormData parts with "Unsupported FormDataPart
  // implementation". expo-file-system's File implements Blob, which
  // expo/fetch serializes correctly. Same approach as pregnancyPhotosApi.
  form.append('photo', new File(uri));

  const endpoint = `${baseUrl}/api/measurements/check-in-photos/${encodeURIComponent(date)}/${type}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
          // Multer must set the multipart boundary itself, so no Content-Type.
        },
        body: form,
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch (err) {
    // Nothing ever came back (dropped connection, timeout, or a proxy
    // rejecting the body before the app server saw it), so log it here — the
    // response-error path below cannot.
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
