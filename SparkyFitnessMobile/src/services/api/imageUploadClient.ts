import { File } from 'expo-file-system';
import { normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';

/**
 * Shared multipart transport for food/meal/entry images.
 *
 * `apiFetch` JSON-encodes its body, so image writes cannot go through it. This
 * mirrors `pregnancyPhotosApi.uploadPhoto` — the app's one proven multipart
 * path — and exists so the auth/proxy/timeout/session-expiry handling is not
 * hand-copied into every image endpoint.
 *
 * Two rules are load-bearing and easy to break:
 *  - Global fetch is Expo's WinterCG `expo/fetch`, which rejects React
 *    Native's `{uri, name, type}` FormData parts with "Unsupported
 *    FormDataPart implementation". An `expo-file-system` `File` implements
 *    Blob and serializes correctly.
 *  - Content-Type must be left unset so multer receives a boundary.
 */
export async function postImageMultipart<T>(params: {
  endpoint: string;
  serviceName: string;
  operation: string;
  method?: 'POST' | 'PUT';
  /** Ordered `images` array with `__new__<n>` placeholders for uploads. */
  order: string[];
  /** Local URIs to upload, in placeholder order. */
  newUris: string[];
  /** Optional JSON payload, sent under `wrapperField` (e.g. `foodData`). */
  payload?: unknown;
  wrapperField?: string;
}): Promise<T> {
  const {
    endpoint,
    serviceName,
    operation,
    method = 'POST',
    order,
    newUris,
    payload,
    wrapperField,
  } = params;

  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);
  // Same transport guard `apiFetch` applies: these requests carry auth headers
  // and user photos, so never send them over plaintext in a release build.
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    throw new Error(
      'HTTPS is required for server connections. Please update your server URL in Settings.',
    );
  }

  const form = new FormData();

  // Where the order array goes depends on whether the route wraps its body.
  //
  // Wrapped routes (foods, meals) run parseMultipartBody, which REPLACES the
  // body with the parsed wrapper object and discards every other text field —
  // so a top-level `images` field would be silently dropped, and the server
  // would treat the request as "these uploads are the complete set" and unlink
  // the existing photos. It has to travel inside the wrapper, as web does.
  //
  // Unwrapped routes (the per-entry image endpoints) read `req.body.images`
  // directly, so the top-level field is correct there.
  //
  // Text fields must precede the file parts either way: multer only reliably
  // exposes fields that arrive before the files in the multipart stream.
  if (payload !== undefined && wrapperField) {
    form.append(wrapperField, JSON.stringify({ ...(payload as object), images: order }));
  } else {
    form.append('images', JSON.stringify(order));
  }

  for (const uri of newUris) {
    form.append('images', new File(uri));
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${endpoint}`,
      {
        method,
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
          // Multer needs to set the boundary: do NOT set Content-Type here.
        },
        body: form,
      },
      UPLOAD_TIMEOUT_MS,
    );
  } catch (err) {
    // A throw here means no response ever arrived (dropped connection,
    // timeout, or a proxy rejecting the body before the app server saw it),
    // so log it; the response-error path below cannot.
    addLog(`[${serviceName}] ${operation} failed without a response`, 'ERROR', [
      String(err),
    ]);
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog(`[${serviceName}] Failed to ${operation}`, 'ERROR', [text]);
    throw new ApiError(
      `Server error: ${response.status} - ${text}`,
      response.status,
      text,
    );
  }

  // 204 has no body; image endpoints otherwise return the updated row. An
  // empty 200 is treated the same, as apiFetch does — response.json() would
  // throw on it after an otherwise successful upload.
  if (response.status === 204 || response.headers?.get('content-length') === '0') {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * Sends a JSON payload, switching to multipart only when there are files to
 * upload — matching web's `buildPayloadRequest`, so servers see the same plain
 * JSON body they always have when a user touches no images.
 */
export async function postPayloadWithImages<T>(params: {
  endpoint: string;
  serviceName: string;
  operation: string;
  method?: 'POST' | 'PUT';
  payload: Record<string, unknown>;
  wrapperField: string;
  order: string[];
  newUris: string[];
  /** Used when no files need uploading. */
  sendJson: (payload: Record<string, unknown>) => Promise<T>;
}): Promise<T> {
  const { payload, order, newUris, sendJson, ...rest } = params;

  if (newUris.length === 0) {
    return sendJson({ ...payload, images: order });
  }

  return postImageMultipart<T>({
    ...rest,
    payload,
    order,
    newUris,
  });
}
