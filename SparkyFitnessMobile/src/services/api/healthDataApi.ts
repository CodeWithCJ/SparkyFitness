import { getActiveServerConfig, proxyHeadersToRecord, ServerConfig } from '../storage';
import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { getAuthHeaders, notifySessionExpired } from './authService';

export interface HealthDataPayloadItem {
  type: string;
  date: string;  // YYYY-MM-DD format
  value: number;
}

export type HealthDataPayload = HealthDataPayloadItem[];

// --- Chunking, timeout, and retry constants ---

export const CHUNK_SIZE = 5_000;
export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

// --- Internal helpers ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps fetch with an AbortController that auto-aborts after timeoutMs.
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

interface RetryConfig {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  serverConfig?: ServerConfig;
}

/**
 * Wraps fetchWithTimeout with retry logic.
 * Retries on network errors, timeouts, and 5xx responses.
 * Does NOT retry on 4xx (including 401 which triggers session expiry).
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  { timeoutMs, maxRetries, baseDelayMs, serverConfig }: RetryConfig,
): Promise<Response> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      if (response.ok) {
        return response;
      }

      // 4xx — not retryable
      if (response.status < 500) {
        if (response.status === 401 && serverConfig?.authType === 'session') {
          notifySessionExpired(serverConfig.id);
        }
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      // 5xx — retryable
      const errorText = await response.text();
      lastError = new Error(`Server error: ${response.status} - ${errorText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If it's a 4xx error we threw above, don't retry
      if (lastError.message.startsWith('Server error: 4')) {
        throw lastError;
      }
    }

    // Retry with exponential backoff (skip delay after last attempt)
    if (attempt < maxRetries - 1) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      addLog(`[API] Retry ${attempt + 1}/${maxRetries - 1}: waiting ${delay}ms`, 'WARNING');
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('All retry attempts failed');
};

// Types that trigger the server's delete-then-insert pre-cleanup.
// All records of these types sharing the same source must stay in a single
// request — the server computes a date range across all three types per source
// and deletes both sleep and exercise rows for that entire range.
const SESSION_TYPES = new Set(['SleepSession', 'ExerciseSession', 'Workout']);

/**
 * Builds chunks that are safe against the server's delete-then-insert logic.
 * Session records (SleepSession/ExerciseSession/Workout) are grouped by source
 * and kept in a single chunk per source (never split, even if > CHUNK_SIZE).
 * Simple records (steps, calories, etc.) are chunked normally by CHUNK_SIZE.
 */
const sendHealthDataChunked = async (
  url: string,
  headers: Record<string, string>,
  data: HealthDataPayload,
  serverConfig: ServerConfig,
): Promise<unknown> => {
  const simpleRecords: HealthDataPayloadItem[] = [];
  const sessionsBySource = new Map<string, HealthDataPayloadItem[]>();

  for (const record of data) {
    if (SESSION_TYPES.has(record.type)) {
      const source = (record as unknown as Record<string, unknown>).source as string ?? 'manual';
      const group = sessionsBySource.get(source);
      if (group) {
        group.push(record);
      } else {
        sessionsBySource.set(source, [record]);
      }
    } else {
      simpleRecords.push(record);
    }
  }

  // Each source's session records go in a single chunk (never split).
  // Simple records are chunked normally.
  const chunks: HealthDataPayloadItem[][] = [];

  for (const sessionRecords of sessionsBySource.values()) {
    chunks.push(sessionRecords);
  }

  for (let i = 0; i < simpleRecords.length; i += CHUNK_SIZE) {
    chunks.push(simpleRecords.slice(i, i + CHUNK_SIZE));
  }

  const totalChunks = chunks.length;
  let recordsSent = 0;
  let lastResult: unknown;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    const chunkStart = recordsSent + 1;
    const chunkEnd = recordsSent + chunk.length;

    if (totalChunks > 1) {
      addLog(
        `[API] Sending chunk ${i + 1}/${totalChunks} (records ${chunkStart}-${chunkEnd} of ${data.length})`,
        'DEBUG',
      );
    }

    try {
      const response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(chunk),
        },
        {
          timeoutMs: FETCH_TIMEOUT_MS,
          maxRetries: MAX_RETRIES,
          baseDelayMs: RETRY_BASE_DELAY_MS,
          serverConfig,
        },
      );

      lastResult = await response.json();
      recordsSent += chunk.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (recordsSent > 0) {
        throw new Error(
          `Sync partially completed: ${recordsSent} of ${data.length} records sent. Failed on chunk ${i + 1}/${totalChunks}: ${message}`,
        );
      }
      throw error;
    }
  }

  return lastResult;
};

/**
 * Sends health data to the server.
 */
export const syncHealthData = async (data: HealthDataPayload): Promise<unknown> => {
  const config = await getActiveServerConfig();
  if (!config) {
    throw new Error('Server configuration not found.');
  }

  const url = normalizeUrl(config.url);

  if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
    throw new Error('HTTPS is required for server connections. Please update your server URL in Settings.');
  }

  console.log(`[API Service] Attempting to sync to URL: ${url}/api/health-data`);

  addLog(`[API] Starting sync of ${data.length} records to server`, 'DEBUG');

  try {
    const result = await sendHealthDataChunked(
      `${url}/api/health-data`,
      {
        'Content-Type': 'application/json',
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      data,
      config,
    );

    addLog(`[API] Sync successful: ${data.length} records sent to server`, 'SUCCESS');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Sync failed: ${message}`, 'ERROR');
    throw error;
  }
};

/**
 * Checks the server connection status.
 */
export const checkServerConnection = async (): Promise<boolean> => {
  const config = await getActiveServerConfig();
  if (!config || !config.url) {
    console.log('[API Service] No active server configuration found for connection check.');
    return false; // No configuration, so no connection
  }

  const url = normalizeUrl(config.url);

  if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
    addLog('[API] Connection check blocked: HTTPS is required', 'WARNING');
    return false;
  }

  try {
    const response = await fetch(`${url}/api/identity/user`, {
      method: 'GET',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
    });
    if (response.ok) {
      return true;
    } else {
      if (response.status === 401 && config.authType === 'session') {
        notifySessionExpired(config.id);
      }
      const errorText = await response.text();
      addLog(`[API] Server connection check failed: status ${response.status}`, 'WARNING', [errorText]);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Server connection check failed: ${message}`, 'ERROR');
    return false;
  }
};
