import { getActiveServerConfig, proxyHeadersToRecord, ServerConfig } from '../storage';
import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { ensureTimezoneBootstrapped } from './preferencesApi';
import { CONNECTION_CHECK_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
import {
  instantToDay,
  instantToDayWithOffset,
  isDayString,
  isValidTimeZone,
} from '@workspace/shared';
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

// Soft cap on one workout chunk's JSON size. Reverse proxies commonly cap
// request bodies at 10 MB; telemetry-heavy sessions run ~250 KB each, and a
// backfill window can hold a month of them for one source, so oversized groups
// are split at calendar-day boundaries (see splitWorkoutGroupBySize). Kept well
// under the proxy cap to leave room for JSON escaping and header overhead.
export const WORKOUT_CHUNK_SOFT_LIMIT_BYTES = 2 * 1024 * 1024;

// Chunk day keys must match the day the server resolves for its per-request
// range delete (resolveHealthEntryDate): the basis instant is `timestamp`,
// bucketed in the record's own timezone or UTC offset when present. A key that
// lands on a different day than the server's lets one chunk's pre-cleanup
// range overlap another chunk's days and delete its freshly inserted rows.
// Day-only basis strings are trusted as-is, exactly as the server does. The
// final fallback must be the server's stored ACCOUNT timezone, not the device
// timezone: ensureTimezoneBootstrapped only fills an unset account timezone
// from the device — it preserves an existing one — so a traveling user (or a
// device with the wrong local clock) can have a device zone that no longer
// matches their account zone. Records with no parseable basis share one ''
// bucket; the server excludes them from its cleanup range, so their grouping
// is inconsequential.
const recordDay = (
  record: HealthDataPayloadItem,
  accountTimezone: string
): string => {
  const basis =
    record.timestamp || record.date || record.entry_date || record.startTime;
  if (!basis) return '';
  if (isDayString(basis)) return basis;
  const instant = new Date(basis);
  if (isNaN(instant.getTime())) return '';
  if (record.record_timezone && isValidTimeZone(record.record_timezone)) {
    return instantToDay(instant, record.record_timezone);
  }
  if (typeof record.record_utc_offset_minutes === 'number') {
    return instantToDayWithOffset(instant, record.record_utc_offset_minutes);
  }
  return instantToDay(instant, accountTimezone);
};

/**
 * Splits one source's workout records into chunks under the size cap without
 * breaking the range-delete contract: whole calendar days only, packed in date
 * order, so consecutive chunks cover disjoint contiguous day ranges and each
 * request's server-side pre-cleanup touches no other chunk's days. A single
 * day that alone exceeds the cap cannot be split and ships as its own chunk.
 */
const splitWorkoutGroupBySize = (
  records: HealthDataPayloadItem[],
  accountTimezone: string,
): HealthDataPayloadItem[][] => {
  const sizeOf = (record: HealthDataPayloadItem): number =>
    JSON.stringify(record).length;

  let totalBytes = 0;
  const byDay = new Map<string, { records: HealthDataPayloadItem[]; bytes: number }>();
  for (const record of records) {
    const day = recordDay(record, accountTimezone);
    const bytes = sizeOf(record);
    totalBytes += bytes;
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.records.push(record);
      bucket.bytes += bytes;
    } else {
      byDay.set(day, { records: [record], bytes });
    }
  }

  if (totalBytes <= WORKOUT_CHUNK_SOFT_LIMIT_BYTES) return [records];

  const chunks: HealthDataPayloadItem[][] = [];
  let current: HealthDataPayloadItem[] = [];
  let currentBytes = 0;
  const days = [...byDay.keys()].sort();
  for (const day of days) {
    const bucket = byDay.get(day)!;
    if (current.length > 0 && currentBytes + bucket.bytes > WORKOUT_CHUNK_SOFT_LIMIT_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(...bucket.records);
    currentBytes += bucket.bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

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
  accountTimezone: string,
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

  // Exercise/Workout: one chunk per source, split only at whole-day boundaries
  // when telemetry pushes a group past the size cap.
  for (const sessionRecords of rangeDeleteBySource.values()) {
    for (const chunk of splitWorkoutGroupBySize(sessionRecords, accountTimezone)) {
      chunks.push(chunk);
    }
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

  // throwOnFailure guarantees a resolved timezone here, but the fallback still
  // covers it defensively rather than assuming the non-null return holds.
  const accountTimezone =
    (await ensureTimezoneBootstrapped({ throwOnFailure: true })) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  addLog(`[API] Syncing to ${url}/api/health-data`, 'DEBUG');

  addLog(`[API] Starting sync of ${data.length} records to server`, 'INFO');

  try {
    const summary = await sendHealthDataChunked(
      `${url}/api/health-data`,
      {
        'Content-Type': 'application/json',
        // 2 declares per-set exercise durations as integer seconds (an absent
        // header means the legacy contract, where those durations are minutes).
        // 3 additionally signals that workout records may carry telemetry —
        // gps_points, hr_samples, laps and telemetry. Those fields are all
        // optional, so a server that predates 3 simply ignores them.
        'X-Workout-Model-Version': '3',
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      data,
      config,
      accountTimezone,
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
    addLog('[API] No active server configuration found for connection check.', 'DEBUG');
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
