import { getActiveServerConfig, proxyHeadersToRecord, ServerConfig } from '../storage';
import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { ensureTimezoneBootstrapped } from './preferencesApi';
import { CONNECTION_CHECK_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
import type { SleepStageEvent } from '../../types/mobileHealthData';

interface BaseHealthDataPayloadItem {
  type: string;
  source?: string;
  timestamp?: string;
  date?: string;
  entry_date?: string;
  value?: number;
  /** IANA timezone when available (best source for HealthKit) */
  record_timezone?: string | null;
  /** Fixed UTC offset in minutes (best fallback for Health Connect) */
  record_utc_offset_minutes?: number | null;
}

export interface HealthDataPayloadItem extends BaseHealthDataPayloadItem {
  bedtime?: string;
  wake_time?: string;
  duration_in_seconds?: number;
  time_asleep_in_seconds?: number;
  sleep_score?: number;
  deep_sleep_seconds?: number;
  light_sleep_seconds?: number;
  rem_sleep_seconds?: number;
  awake_sleep_seconds?: number;
  stage_events?: SleepStageEvent[];
  activityType?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  caloriesBurned?: number;
  distance?: number;
  notes?: string;
  raw_data?: unknown;
  sets?: unknown[];
  source_id?: string;
  unit?: string;
  [key: string]: unknown;
}

export type HealthDataPayload = HealthDataPayloadItem[];

/** Per-record rejection reported by the server for an otherwise-accepted sync request. */
export interface RecordSyncError {
  error: string;
  entry?: unknown;
}

/**
 * Outcome of a chunked health-data upload. Per-record rejections are reported
 * here instead of thrown so the sync cursor can advance past poison records;
 * only whole-request failures (network, auth, all-records-rejected chunks)
 * throw.
 */
export interface HealthDataSyncSummary {
  /** Records transmitted in chunks the server accepted (including partially rejected ones). */
  recordsSent: number;
  /** Per-record rejections aggregated across all chunks. */
  recordErrors: RecordSyncError[];
}

/** Shape of the server's POST /api/health-data response body (fields absent on old servers). */
interface HealthDataResponseBody {
  processed?: unknown[];
  errors?: RecordSyncError[];
  skipped?: { reason?: string; entry?: unknown }[];
}

// --- Chunking, timeout, and retry constants ---

export const CHUNK_SIZE = 5_000;
// Sleep sessions are expensive server-side (per-session upsert + per-stage merge
// + aggregate recompute), so they get a smaller cap than simple measurements. #1263
export const SESSION_CHUNK_SIZE = 50;
export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

// --- Internal helpers ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        throw new ApiError(`Server error: ${response.status} - ${errorText}`, response.status, errorText);
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

// Exercise/Workout use server-side delete-then-insert per source (delete that
// source's rows for the affected days, then re-insert), so a source's records
// must stay in one request: splitting across overlapping date ranges lets a later
// chunk's pre-cleanup wipe an earlier chunk's inserts.
const RANGE_DELETE_TYPES = new Set(['ExerciseSession', 'Workout']);

// Types the server ingests idempotently by natural key (no range-delete), so they
// can be chunked freely — but each record is expensive to process server-side
// (multiple queries / merges), so they're capped at SESSION_CHUNK_SIZE rather than
// the much larger simple-measurement CHUNK_SIZE. Sleep merges by key (#1180);
// Nutrition upserts each food entry by (source, source_id).
const SMALL_CHUNK_TYPES = new Set(['SleepSession', 'Nutrition']);

// Old servers (pre per-record contract) 400 the whole batch when any record
// fails, but only after processing the valid ones. A 400 whose body carries
// per-record results with at least one processed record is that legacy partial
// success. A 400 with no processed records (all rejected, or a malformed-body
// {error} shape) stays a real failure.
const parseLegacyPartialFailure = (error: unknown): RecordSyncError[] | null => {
  if (!(error instanceof ApiError) || error.statusCode !== 400 || !error.body) {
    return null;
  }
  try {
    const parsed = JSON.parse(error.body);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.errors) &&
      Array.isArray(parsed.processed) &&
      parsed.processed.length > 0
    ) {
      return parsed.errors as RecordSyncError[];
    }
  } catch {
    // body wasn't JSON — not a legacy partial-failure response
  }
  return null;
};

/** Splits the payload into request-sized chunks (see RANGE_DELETE_TYPES). */
const sendHealthDataChunked = async (
  url: string,
  headers: Record<string, string>,
  data: HealthDataPayload,
  serverConfig: ServerConfig,
): Promise<HealthDataSyncSummary> => {
  const simpleRecords: HealthDataPayloadItem[] = [];
  const smallChunkRecords: HealthDataPayloadItem[] = [];
  const rangeDeleteBySource = new Map<string, HealthDataPayloadItem[]>();

  for (const record of data) {
    if (SMALL_CHUNK_TYPES.has(record.type)) {
      smallChunkRecords.push(record);
    } else if (RANGE_DELETE_TYPES.has(record.type)) {
      const source = (record as unknown as Record<string, unknown>).source as string ?? 'manual';
      const group = rangeDeleteBySource.get(source);
      if (group) {
        group.push(record);
      } else {
        rangeDeleteBySource.set(source, [record]);
      }
    } else {
      simpleRecords.push(record);
    }
  }

  const chunks: HealthDataPayloadItem[][] = [];

  // Exercise/Workout: one chunk per source, never split.
  for (const sessionRecords of rangeDeleteBySource.values()) {
    chunks.push(sessionRecords);
  }

  // Sleep/Nutrition: chunked by SESSION_CHUNK_SIZE.
  for (let i = 0; i < smallChunkRecords.length; i += SESSION_CHUNK_SIZE) {
    chunks.push(smallChunkRecords.slice(i, i + SESSION_CHUNK_SIZE));
  }

  // Simple measurements: chunked by CHUNK_SIZE.
  for (let i = 0; i < simpleRecords.length; i += CHUNK_SIZE) {
    chunks.push(simpleRecords.slice(i, i + CHUNK_SIZE));
  }

  const totalChunks = chunks.length;
  let recordsSent = 0;
  const recordErrors: RecordSyncError[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    const chunkStart = recordsSent + 1;
    const chunkEnd = recordsSent + chunk.length;

    if (totalChunks > 1) {
      addLog(
        `[API] Sending chunk ${i + 1}/${totalChunks} (records ${chunkStart}-${chunkEnd} of ${data.length})`,
        'INFO',
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

      const result = (await response.json()) as HealthDataResponseBody | null;
      // Old servers omit errors/skipped — treat as clean.
      const chunkErrors = Array.isArray(result?.errors) ? result.errors : [];
      const chunkProcessed = Array.isArray(result?.processed) ? result.processed : [];
      const chunkSkipped = Array.isArray(result?.skipped) ? result.skipped : [];

      if (chunkSkipped.length > 0) {
        addLog(
          `[API] Server skipped ${chunkSkipped.length} record(s) in chunk ${i + 1}/${totalChunks} (intentionally not written)`,
          'INFO',
        );
      }

      // A chunk where every record was rejected is indistinguishable from a
      // systemic failure — advancing the cursor there would silently drop the
      // whole window, so treat it like a failed chunk.
      if (chunkErrors.length > 0 && chunkProcessed.length === 0) {
        addLog(
          `[API] chunk ${i + 1}/${totalChunks} rejected in full by server: ${chunkErrors.length} records`,
          'ERROR',
        );
        throw new Error(
          `Chunk ${i + 1}/${totalChunks} rejected in full by server: ${chunkErrors.length} records rejected.`,
        );
      }

      recordErrors.push(...chunkErrors);
      recordsSent += chunk.length;
    } catch (error) {
      const legacyErrors = parseLegacyPartialFailure(error);
      if (legacyErrors) {
        addLog(
          `[API] Legacy server reported ${legacyErrors.length} rejected record(s) in chunk ${i + 1}/${totalChunks}; continuing`,
          'WARNING',
        );
        recordErrors.push(...legacyErrors);
        recordsSent += chunk.length;
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (recordsSent > 0) {
        throw new Error(
          `Sync partially completed: ${recordsSent} of ${data.length} records sent. Failed on chunk ${i + 1}/${totalChunks}: ${message}`,
        );
      }
      throw error;
    }
  }

  return { recordsSent, recordErrors };
};

/**
 * Sends health data to the server. Resolves with a summary whose recordErrors
 * carry per-record server rejections; callers must not treat those as a failed
 * sync (see HealthDataSyncSummary).
 */
export const syncHealthData = async (
  data: HealthDataPayload,
): Promise<HealthDataSyncSummary | undefined> => {
  const config = await getActiveServerConfig();
  if (!config) {
    throw new Error('Server configuration not found.');
  }

  const url = normalizeUrl(config.url);

  if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
    throw new Error('HTTPS is required for server connections. Please update your server URL in Settings.');
  }

  if (data.length === 0) {
    addLog('[API] No health data to sync', 'INFO');
    return undefined;
  }

  await ensureTimezoneBootstrapped({ throwOnFailure: true });

  console.log(`[API Service] Attempting to sync to URL: ${url}/api/health-data`);

  addLog(`[API] Starting sync of ${data.length} records to server`, 'INFO');

  try {
    const summary = await sendHealthDataChunked(
      `${url}/api/health-data`,
      {
        'Content-Type': 'application/json',
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      data,
      config,
    );

    if (summary.recordErrors.length > 0) {
      addLog(
        `[API] Sync sent ${summary.recordsSent} records; server rejected ${summary.recordErrors.length} record(s)`,
        'WARNING',
        summary.recordErrors.slice(0, 10).map((e) => e.error),
      );
    } else {
      addLog(`[API] Sync successful: ${data.length} records sent to server`, 'INFO');
    }
    return summary;
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
    const response = await fetchWithTimeout(
      `${url}/api/identity/user`,
      {
        method: 'GET',
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
        },
      },
      CONNECTION_CHECK_TIMEOUT_MS,
    );
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
