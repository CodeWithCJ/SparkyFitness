import {
  initialize,
  requestPermission,
  getGrantedPermissions,
  readRecords,
  aggregateRecord,
  aggregateGroupByDuration,
  aggregateGroupByPeriod,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import {
  AggregatedHealthRecord,
  PermissionRequest,
  GrantedPermission,
  type HCZoneOffset,
  type ReadResult,
} from '../../types/healthRecords';
import { ceilToLocalDayStart, getSyncStartDate } from '../../utils/syncUtils';
import {
  isClientUnavailableError,
  isQuotaExceededError,
} from '../shared/quotaError';
import { type TelemetryRunContext } from '../shared/telemetryBudget';
import { hasEnrichedSession } from '../shared/enrichedSessionCache';
import {
  createConcurrencyLimiter,
  runTasksInBatches,
} from '../../utils/concurrency';
import { getErrorMessage } from '../../utils/errors';
import { collectSessionTelemetry, sessionCacheKey } from './workoutTelemetry';
import { deriveActiveCalories } from '@workspace/shared';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };
export { isQuotaExceededError };
export { sessionCacheKey };

/**
 * Enrichment runs two very different costs per session, so they get two limits.
 *
 * The four calorie/basal/distance aggregates return a single scalar each — cheap to
 * carry over the bridge. Throttling those as hard as telemetry is what would
 * push a large workout library toward the 60s per-metric timeout, so they run
 * at the wider limit.
 *
 * Telemetry (route plus up to five sample series) returns large arrays that are
 * deserialized, flat-mapped and sorted on the JS thread — that is the burst
 * that froze the UI in #2191, and it stays tightly capped no matter how wide
 * the outer batch runs.
 *
 * Both are far below the unbounded fan-out that caused the bug, and well inside
 * the Health Connect API call quota (see shared/quotaError.ts).
 */
const AGGREGATE_CONCURRENCY = 4;
const TELEMETRY_CONCURRENCY = 2;

/**
 * Shared across concurrent enrichment runs (a foreground sync overlapping a
 * background one), so the cap is a real ceiling on native telemetry reads
 * rather than a per-run one.
 */
const limitTelemetry = createConcurrencyLimiter(TELEMETRY_CONCURRENCY);

export const initHealthConnect = async (): Promise<boolean> => {
  try {
    const isInitialized = await initialize();
    return isInitialized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] Failed to initialize Health Connect: ${message}`
    );
    return false;
  }
};

export const requestHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<boolean> => {
  try {
    const uniquePermissions = permissionsToRequest.filter(
      (permission, index, allPermissions) =>
        allPermissions.findIndex(
          (candidate) =>
            candidate.recordType === permission.recordType &&
            candidate.accessType === permission.accessType
        ) === index
    );

    // Cast to library's Permission type - our PermissionRequest interface is compatible
    const grantedPermissions = (await requestPermission(
      uniquePermissions as Parameters<typeof requestPermission>[0]
    )) as GrantedPermission[];

    const allGranted = uniquePermissions.every((requestedPerm) =>
      grantedPermissions.some(
        (grantedPerm) =>
          grantedPerm.recordType === requestedPerm.recordType &&
          grantedPerm.accessType === requestedPerm.accessType
      )
    );

    if (allGranted) {
      addLog(
        '[HealthConnectService] All requested permissions granted.',
        'INFO'
      );
      return true;
    } else {
      addLog(
        '[HealthConnectService] Not all requested permissions granted.',
        'WARNING',
        [
          `requested: ${JSON.stringify(permissionsToRequest)}`,
          `granted: ${JSON.stringify(grantedPermissions)}`,
        ]
      );
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] Failed to request health permissions: ${message}`,
      'ERROR'
    );
    throw error;
  }
};

// Health Connect's history read permission ("Allow access to all past data"). The
// runtime grant is required to read records older than 30 days; without it reads
// silently cap at the 30-day window, which the history-import probes then reflect.
const HISTORY_READ_PERMISSION = {
  accessType: 'read',
  recordType: 'ReadHealthDataHistory',
} as const;

const isHistoryReadGrant = (permission: {
  accessType: string;
  recordType: string;
}): boolean =>
  permission.accessType === 'read' &&
  permission.recordType === 'ReadHealthDataHistory';

/**
 * Ensures the history read permission is granted, requesting it if not. Returns
 * whether it is granted; callers treat a decline as informational (probes then
 * naturally cap the reachable floor at ~30 days), never as a hard failure.
 */
export const ensureHistoryReadPermission = async (): Promise<boolean> => {
  try {
    const granted = await getGrantedPermissions();
    if (granted.some(isHistoryReadGrant)) {
      return true;
    }
    const result = await requestPermission([HISTORY_READ_PERMISSION]);
    return result.some(isHistoryReadGrant);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] History read permission check failed: ${message}`,
      'WARNING'
    );
    return false;
  }
};

const PAGE_SIZE = 5000;
const MAX_PAGES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_DAY_WINDOW_MS = DAY_MS;
const FALLBACK_HOUR_WINDOW_MS = 60 * 60 * 1000;

interface ReadRecordsOptions {
  timeRangeFilter: {
    operator: 'between';
    startTime: string;
    endTime: string;
  };
  pageSize: number;
  pageToken?: string;
  ascendingOrder?: boolean;
}

// Aliases of the platform-neutral ReadResult shared with iOS.
export type HealthConnectReadResult = ReadResult;

export type HealthConnectAggregateResult = ReadResult<AggregatedHealthRecord>;

const formatDateForLog = (date: Date): string => {
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : String(date);
};

const getWindowError = (
  operation: string,
  startDate: Date,
  endDate: Date
): string | undefined => {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return `Invalid Health Connect ${operation} window: startTime (${formatDateForLog(startDate)}) and endTime (${formatDateForLog(endDate)}) must be valid dates.`;
  }

  if (startMs >= endMs) {
    return `Invalid Health Connect ${operation} window: startTime (${formatDateForLog(startDate)}) must be before endTime (${formatDateForLog(endDate)}).`;
  }

  return undefined;
};

const buildFallbackWindows = (
  startDate: Date,
  endDate: Date,
  windowMs: number
): { start: Date; end: Date }[] => {
  const windows: { start: Date; end: Date }[] = [];
  let cursorMs = startDate.getTime();
  const endMs = endDate.getTime();

  while (cursorMs < endMs) {
    const nextMs = Math.min(cursorMs + windowMs, endMs);
    if (nextMs > cursorMs) {
      windows.push({ start: new Date(cursorMs), end: new Date(nextMs) });
    }
    cursorMs = nextMs;
  }

  return windows;
};

const readHealthRecordsOnce = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<
  HealthConnectReadResult & {
    failedOnFirstPage: boolean;
    quotaExceeded?: boolean;
    clientUnavailable?: boolean;
  }
> => {
  const allRecords: unknown[] = [];
  let pageToken: string | undefined;
  let page = 0;
  const windowError = getWindowError(
    `read for ${recordType}`,
    startDate,
    endDate
  );
  if (windowError) {
    addLog(`[HealthConnectService] ${windowError}`, 'WARNING');
    return { records: [], error: windowError, failedOnFirstPage: true };
  }

  try {
    do {
      page++;
      const options: ReadRecordsOptions = {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
        pageSize: PAGE_SIZE,
      };
      if (pageToken) {
        options.pageToken = pageToken;
      }

      const result = await readRecords(
        recordType as Parameters<typeof readRecords>[0],
        options as unknown as Parameters<typeof readRecords>[1]
      );

      const records = result.records || [];
      allRecords.push(...records);
      pageToken = result.pageToken;
    } while (pageToken && page < MAX_PAGES);

    if (page > 1) {
      addLog(
        `[HealthConnectService] Read ${allRecords.length} ${recordType} records across ${page} pages`
      );
    }
    if (pageToken && page >= MAX_PAGES) {
      const error = `Hit max page limit (${MAX_PAGES}) for ${recordType}; returning ${allRecords.length} records collected so far.`;
      addLog(`[HealthConnectService] ${error}`, 'WARNING');
      return { records: allRecords, error, failedOnFirstPage: false };
    }

    return { records: allRecords, failedOnFirstPage: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quotaExceeded = isQuotaExceededError(error);
    const clientUnavailable = isClientUnavailableError(error);
    addLog(
      `[HealthConnectService] Failed reading ${recordType} on page ${page}: ${message}. Returning ${allRecords.length} records collected so far.`,
      'ERROR'
    );
    return {
      records: allRecords,
      error: message,
      failedOnFirstPage: page <= 1 && allRecords.length === 0,
      quotaExceeded,
      clientUnavailable,
    };
  }
};

const readHealthRecordsFallback = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<HealthConnectReadResult> => {
  const records: unknown[] = [];
  const errors: string[] = [];
  const dayWindows = buildFallbackWindows(
    startDate,
    endDate,
    FALLBACK_DAY_WINDOW_MS
  );

  addLog(
    `[HealthConnectService] Retrying ${recordType} read in ${dayWindows.length} day window(s) after a page-1 failure.`,
    'WARNING'
  );

  for (const dayWindow of dayWindows) {
    const dayResult = await readHealthRecordsOnce(
      recordType,
      dayWindow.start,
      dayWindow.end
    );
    if (!dayResult.error) {
      records.push(...dayResult.records);
      continue;
    }

    const durationMs = dayWindow.end.getTime() - dayWindow.start.getTime();
    if (dayResult.failedOnFirstPage && durationMs > FALLBACK_HOUR_WINDOW_MS) {
      const hourWindows = buildFallbackWindows(
        dayWindow.start,
        dayWindow.end,
        FALLBACK_HOUR_WINDOW_MS
      );
      for (const hourWindow of hourWindows) {
        const hourResult = await readHealthRecordsOnce(
          recordType,
          hourWindow.start,
          hourWindow.end
        );
        records.push(...hourResult.records);
        if (hourResult.error) {
          errors.push(
            `${formatDateForLog(hourWindow.start)}-${formatDateForLog(hourWindow.end)}: ${hourResult.error}`
          );
        }
      }
      continue;
    }

    records.push(...dayResult.records);
    errors.push(
      `${formatDateForLog(dayWindow.start)}-${formatDateForLog(dayWindow.end)}: ${dayResult.error}`
    );
  }

  if (errors.length === 0) {
    addLog(
      `[HealthConnectService] Recovered ${records.length} ${recordType} records using fallback windows.`,
      'WARNING'
    );
    return { records };
  }

  const error = `Failed reading ${errors.length} fallback ${recordType} window(s); returning ${records.length} records collected. First error: ${errors[0]}`;
  addLog(`[HealthConnectService] ${error}`, 'ERROR');
  return { records, error };
};

/**
 * Client-unavailable bookkeeping for one sync run.
 *
 * The Health Connect client is created once at startup and never rebuilt, so
 * when it goes away (the app was backgrounded, the provider updated) every
 * remaining read in the run fails the same way. Reconnecting is nearly always
 * enough — but it must be attempted once per run, not once per metric, or 33
 * enabled metrics mean 33 reconnects. Mirrors the iOS locked-device counters
 * (`databaseInaccessibleCount` in healthkit/index.ts).
 */
let clientUnavailableCount = 0;
let reconnectAttemptedThisRun = false;

export function resetClientUnavailableState(): void {
  clientUnavailableCount = 0;
  reconnectAttemptedThisRun = false;
}

export function getClientUnavailableCount(): number {
  return clientUnavailableCount;
}

/**
 * Reconnects once per run and reports whether a retry is worth attempting.
 * A second caller in the same run gets false — the first attempt already
 * settled it, and the client does not become available by asking twice.
 */
const tryReconnectOnce = async (): Promise<boolean> => {
  if (reconnectAttemptedThisRun) return false;
  reconnectAttemptedThisRun = true;

  addLog(
    '[HealthConnectService] Health Connect client is unavailable — reconnecting once before giving up.',
    'WARNING'
  );
  return initHealthConnect();
};

export const readHealthRecordsDetailed = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<HealthConnectReadResult> => {
  let result = await readHealthRecordsOnce(recordType, startDate, endDate);

  // A dead client is recoverable far more often than not, and the previous
  // behaviour (splitting the window and failing once per day) recovered
  // nothing. Reconnect and read again before treating it as fatal (#2191).
  if (result.clientUnavailable) {
    clientUnavailableCount++;
    if (await tryReconnectOnce()) {
      result = await readHealthRecordsOnce(recordType, startDate, endDate);
      if (!result.clientUnavailable) {
        addLog(
          `[HealthConnectService] Reconnected to Health Connect; ${recordType} read resumed.`,
          'INFO'
        );
      }
    }
  }

  if (!result.error || !result.failedOnFirstPage) {
    return { records: result.records, error: result.error };
  }

  // Splitting into smaller windows would multiply the call rate and keep us
  // pinned against the quota. Surface the original error instead.
  if (result.quotaExceeded) {
    addLog(
      `[HealthConnectService] Skipping fallback split for ${recordType}: Health Connect quota exceeded.`,
      'WARNING'
    );
    return { records: result.records, error: result.error };
  }

  // Still dead after the reconnect above. Splitting would turn one error into
  // one per window per metric — hundreds of identical log lines and the
  // AsyncStorage churn that comes with them, for no recovered records (#2191).
  // The error reaches syncErrors, which holds the cursor so the window is
  // retried next cycle.
  if (result.clientUnavailable) {
    addLog(
      `[HealthConnectService] Skipping fallback split for ${recordType}: Health Connect client is unavailable.`,
      'WARNING'
    );
    return { records: result.records, error: result.error };
  }

  const windowMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(windowMs) || windowMs <= FALLBACK_HOUR_WINDOW_MS) {
    return { records: result.records, error: result.error };
  }

  return readHealthRecordsFallback(recordType, startDate, endDate);
};

export const readHealthRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> => {
  const result = await readHealthRecordsDetailed(
    recordType,
    startDate,
    endDate
  );
  return result.records;
};

// Probes read from the 1970 epoch: backdated manual entries and third-party
// imports can predate any "reasonable" floor, and the wider window costs nothing.
const PROBE_EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * Earliest stored record of a type across all history, via a single ascending
 * pageSize-1 read. Interval records carry startTime, instantaneous ones (Weight,
 * Height, ...) carry time. No data = { records: [] }; failures = { records: [],
 * error } (quota errors stay string-detectable via isQuotaExceededError).
 */
export const readEarliestRecordDetailed = async (
  recordType: string
): Promise<ReadResult<{ startTime: string }>> => {
  try {
    const result = await readRecords(
      recordType as Parameters<typeof readRecords>[0],
      {
        timeRangeFilter: {
          operator: 'between',
          startTime: PROBE_EPOCH_ISO,
          endTime: new Date().toISOString(),
        },
        pageSize: 1,
        ascendingOrder: true,
      } as unknown as Parameters<typeof readRecords>[1]
    );
    const record = (
      result.records as { startTime?: string; time?: string }[]
    )[0];
    const startTime = record?.startTime ?? record?.time;
    return startTime ? { records: [{ startTime }] } : { records: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] Earliest-record probe for ${recordType} failed: ${message}`,
      'ERROR'
    );
    return { records: [], error: message };
  }
};

/**
 * Aggregates a cumulative metric by local day for [startDate, endDate].
 * HC's native aggregation handles cross-origin dedup using the user's source
 * priority list — matching what HC's own UI displays — so callers do not
 * need to deduplicate records themselves (issue #1279). Native call counts
 * stay bounded regardless of window length (per-day native calls previously
 * blew HC's API quota).
 *
 * Day attribution follows the zone offsets stored on the records, matching
 * how HC's own UI assigns records to days (issue #1712):
 *
 * - When the records' offsets match the device zone (the stationary case,
 *   including across DST — device zone rules cover it), a single
 *   aggregateGroupByPeriod call buckets by device-local days.
 * - When they diverge (the user changed timezone), day windows are rebuilt
 *   as fixed 24h instant ranges anchored at the *records'* midnights and
 *   aggregated with aggregateGroupByDuration — one call per offset segment,
 *   at most two segments. Without this, HC re-bins up to a week of pre-move
 *   records across the new zone's midnights and day totals drift by
 *   whatever crossed midnight.
 *
 * The server treats `date`-only payloads as authoritative for day
 * attribution (see resolveHealthEntryDate's basisIsDayOnly short-circuit in
 * measurementService.ts); `record_utc_offset_minutes` carries the offset
 * used for each day's attribution.
 */
export type CumulativeMetricRecordType =
  | 'Steps'
  | 'Distance'
  | 'ActiveCaloriesBurned'
  | 'TotalCaloriesBurned'
  | 'BasalMetabolicRate'
  | 'FloorsClimbed';

export interface CumulativeMetricSpec {
  recordType: CumulativeMetricRecordType;
  /** Pulls the scalar total out of HC's aggregateRecord result envelope. */
  extractValue: (result: unknown) => number;
  /** Value emitted as AggregatedHealthRecord.type. */
  outputType: string;
  /** Round to integer (true for kcal / meters). Steps + floors are already integral. */
  round?: boolean;
}

const formatLocalDay = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Canonical implementation lives with the other sync window helpers; re-exported
// here because HC's aggregateGroupByPeriod anchors DAYS buckets at the supplied
// start, so callers of this module align cumulative query starts with it.
export { alignToLocalDayStart } from '../../utils/syncUtils';

type EdgeProbeResult =
  | { outcome: 'record'; instantMs: number; offsetMinutes?: number }
  | { outcome: 'empty' }
  | { outcome: 'error' };

/**
 * Reads the first (ascending) or last (descending) record in the range and
 * returns its start instant plus the zone offset stored on it, pairing the
 * offset with the matching timestamp (start with start, end with end) so a
 * record spanning a DST shift can't mix an end offset with a start instant.
 */
const readEdgeRecord = async (
  recordType: CumulativeMetricRecordType,
  startDate: Date,
  endDate: Date,
  ascending: boolean
): Promise<EdgeProbeResult> => {
  try {
    if (getWindowError(`offset probe for ${recordType}`, startDate, endDate)) {
      return { outcome: 'error' };
    }
    const result = await readRecords(
      recordType as Parameters<typeof readRecords>[0],
      {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
        pageSize: 1,
        ascendingOrder: ascending,
      } as unknown as Parameters<typeof readRecords>[1]
    );
    type EdgeRecord = {
      startTime?: string;
      endTime?: string;
      startZoneOffset?: HCZoneOffset;
      endZoneOffset?: HCZoneOffset;
    };
    const record = (result.records as EdgeRecord[])[0];
    if (!record) {
      return { outcome: 'empty' };
    }
    const startMs = record.startTime
      ? new Date(record.startTime).getTime()
      : NaN;
    const endMs = record.endTime ? new Date(record.endTime).getTime() : NaN;
    if (
      record.startZoneOffset?.totalSeconds != null &&
      Number.isFinite(startMs)
    ) {
      return {
        outcome: 'record',
        instantMs: startMs,
        offsetMinutes: Math.round(record.startZoneOffset.totalSeconds / 60),
      };
    }
    if (record.endZoneOffset?.totalSeconds != null && Number.isFinite(endMs)) {
      return {
        outcome: 'record',
        instantMs: endMs,
        offsetMinutes: Math.round(record.endZoneOffset.totalSeconds / 60),
      };
    }
    const instantMs = Number.isFinite(startMs) ? startMs : endMs;
    if (!Number.isFinite(instantMs)) {
      return { outcome: 'error' };
    }
    return { outcome: 'record', instantMs };
  } catch {
    return { outcome: 'error' };
  }
};

/** UTC offset minutes the device zone applies at the given instant. */
const deviceOffsetMinutesAt = (instantMs: number): number =>
  -new Date(instantMs).getTimezoneOffset();

/** Device-local wall-clock fields, used for fixed-offset instant arithmetic. */
interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

const wallClockParts = (date: Date): WallClockParts => ({
  year: date.getFullYear(),
  month: date.getMonth(),
  day: date.getDate(),
  hour: date.getHours(),
  minute: date.getMinutes(),
  second: date.getSeconds(),
  ms: date.getMilliseconds(),
});

/**
 * Epoch ms of the wall clock shifted by dayShift days and interpreted at a
 * fixed UTC offset — "midnight of day k in the records' zone" when the parts
 * are a midnight.
 */
const instantAtOffset = (
  parts: WallClockParts,
  dayShift: number,
  offsetMinutes: number
): number =>
  Date.UTC(
    parts.year,
    parts.month,
    parts.day + dayShift,
    parts.hour,
    parts.minute,
    parts.second,
    parts.ms
  ) -
  offsetMinutes * 60_000;

/** YYYY-MM-DD label of the wall clock shifted by dayShift days. */
const dayLabelAt = (parts: WallClockParts, dayShift: number): string => {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month, parts.day + dayShift)
  );
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Index of the last included calendar day relative to the parts' day (day 0). */
const dayIndexSpan = (parts: WallClockParts, endDate: Date): number => {
  // Health Connect time ranges are end-exclusive. Looking one millisecond back
  // keeps an end already at midnight from opening a bucket for the next day.
  const end = wallClockParts(new Date(endDate.getTime() - 1));
  return Math.round(
    (Date.UTC(end.year, end.month, end.day) -
      Date.UTC(parts.year, parts.month, parts.day)) /
      DAY_MS
  );
};

/**
 * One fixed-offset stretch of the window. Buckets are fixed 24h instant
 * ranges from startMs; a bucket landing past lastDayIndex is either folded
 * into it (the extended evening of the day before a westward switch) or
 * dropped (records the source stamped into a local day beyond the window —
 * the next sync's window covers that day).
 */
interface AggregationSegment {
  startMs: number;
  endMs: number;
  firstDayIndex: number;
  lastDayIndex: number;
  offsetMinutes: number;
  overflow: 'fold' | 'drop';
}

/**
 * Binary-searches the first day index (1..lastDayIndex + 1) whose midnight
 * boundary belongs to the post-transition offset. Assumes offsets form a
 * single step from off0 to off1 over the window; returns undefined as soon
 * as a probe contradicts that (third offset, probe failure) so the caller
 * can fall back to device-zone bucketing instead of guessing.
 */
const findSwitchDayIndex = async (
  recordType: CumulativeMetricRecordType,
  parts: WallClockParts,
  lastDayIndex: number,
  off0: number,
  off1: number,
  endDate: Date
): Promise<number | undefined> => {
  let lo = 1;
  let hi = lastDayIndex + 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const probeStart = Math.min(
      instantAtOffset(parts, mid, off0),
      instantAtOffset(parts, mid, off1)
    );
    const probe = await readEdgeRecord(
      recordType,
      new Date(probeStart),
      endDate,
      true
    );
    if (probe.outcome === 'empty') {
      // No records at or after this midnight; its boundary offset is moot.
      hi = mid;
      continue;
    }
    if (probe.outcome === 'error' || probe.offsetMinutes == null) {
      return undefined;
    }
    if (probe.offsetMinutes === off0) {
      lo = mid + 1;
    } else if (probe.offsetMinutes === off1) {
      hi = mid;
    } else {
      return undefined;
    }
  }
  return lo;
};

/**
 * Plans the offset-anchored segments for a window whose records were stamped
 * in a zone other than the device's. Returns undefined whenever the data
 * doesn't look like a clean timezone change — callers then keep device-zone
 * bucketing, which is the pre-#1712 behavior.
 */
const buildOffsetSegments = async (
  recordType: CumulativeMetricRecordType,
  startDate: Date,
  endDate: Date,
  firstOffsetMinutes: number
): Promise<AggregationSegment[] | undefined> => {
  const lastProbe = await readEdgeRecord(recordType, startDate, endDate, false);
  if (lastProbe.outcome !== 'record' || lastProbe.offsetMinutes == null) {
    return undefined;
  }
  const off0 = firstOffsetMinutes;
  const off1 = lastProbe.offsetMinutes;
  const parts = wallClockParts(startDate);
  const lastDayIndex = dayIndexSpan(parts, endDate);
  const endMs = endDate.getTime();
  const anchor = instantAtOffset(parts, 0, off0);
  const wholeWindow: AggregationSegment = {
    startMs: anchor,
    endMs,
    firstDayIndex: 0,
    lastDayIndex,
    offsetMinutes: off0,
    overflow: 'drop',
  };

  if (off0 === off1) {
    return [wholeWindow];
  }
  // A mid-window offset change is only trustworthy as travel when the window
  // ends in the device's current zone; otherwise it's likely one source
  // stamping bogus offsets (e.g. a UTC-stamping exporter) and re-bucketing
  // would scramble a stationary user's days.
  if (off1 !== deviceOffsetMinutesAt(lastProbe.instantMs)) {
    return undefined;
  }
  // An offset jump of a day or more (dateline hop) degenerates the day-window
  // math in both directions — eastward the segments invert, westward whole
  // misattributed buckets would fold into the pre-switch day.
  if (Math.abs(off1 - off0) * 60_000 >= DAY_MS) {
    return undefined;
  }
  const switchDay = await findSwitchDayIndex(
    recordType,
    parts,
    lastDayIndex,
    off0,
    off1,
    endDate
  );
  if (switchDay == null) {
    return undefined;
  }
  const boundary = instantAtOffset(parts, switchDay, off1);
  if (boundary >= endMs) {
    // Transition after the window's last midnight: every boundary is still
    // the old zone's.
    return [wholeWindow];
  }
  return [
    {
      startMs: anchor,
      endMs: boundary,
      firstDayIndex: 0,
      lastDayIndex: switchDay - 1,
      offsetMinutes: off0,
      overflow: 'fold',
    },
    {
      startMs: boundary,
      endMs,
      firstDayIndex: switchDay,
      lastDayIndex,
      offsetMinutes: off1,
      overflow: 'drop',
    },
  ];
};

/**
 * Today's stationary path: one aggregateGroupByPeriod call bucketing by
 * device-local calendar days.
 */
const aggregateByDeviceZone = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  endDate: Date,
  rangeOffsetMinutes: number | undefined
): Promise<HealthConnectAggregateResult> => {
  type PeriodBucket = { result: unknown; startTime: string; endTime: string };
  let buckets: PeriodBucket[];
  try {
    buckets = (await aggregateGroupByPeriod({
      recordType: spec.recordType as Parameters<
        typeof aggregateGroupByPeriod
      >[0]['recordType'],
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    })) as unknown as PeriodBucket[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] aggregateGroupByPeriod(${spec.recordType}) failed: ${message}`,
      'ERROR'
    );
    return { records: [], error: message };
  }

  const results: AggregatedHealthRecord[] = [];
  for (const bucket of buckets) {
    const value = spec.extractValue(bucket.result);
    if (!Number.isFinite(value) || value <= 0) continue;

    const rec: AggregatedHealthRecord = {
      date: formatLocalDay(new Date(bucket.startTime)),
      value: spec.round ? Math.round(value) : value,
      type: spec.outputType,
    };
    if (rangeOffsetMinutes != null) {
      rec.record_utc_offset_minutes = rangeOffsetMinutes;
    }
    results.push(rec);
  }

  addLog(
    `[HealthConnectService] ${spec.recordType} aggregation: ${results.length} days`,
    'DEBUG'
  );
  return { records: results };
};

/**
 * Offset-anchored path: fixed 24h buckets per segment via
 * aggregateGroupByDuration, so day boundaries sit at the records' own
 * midnights instead of the device zone's. Native dedup applies within each
 * call exactly as in the device-zone path.
 */
const aggregateByRecordOffsets = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  segments: AggregationSegment[]
): Promise<HealthConnectAggregateResult> => {
  const parts = wallClockParts(startDate);
  const days = new Map<number, { value: number; offsetMinutes: number }>();

  for (const segment of segments) {
    type DurationBucket = {
      result: unknown;
      startTime: string;
      endTime: string;
    };
    let buckets: DurationBucket[];
    try {
      buckets = (await aggregateGroupByDuration({
        recordType: spec.recordType as Parameters<
          typeof aggregateGroupByDuration
        >[0]['recordType'],
        timeRangeFilter: {
          operator: 'between',
          startTime: new Date(segment.startMs).toISOString(),
          endTime: new Date(segment.endMs).toISOString(),
        },
        timeRangeSlicer: { duration: 'DAYS', length: 1 },
      })) as unknown as DurationBucket[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[HealthConnectService] aggregateGroupByDuration(${spec.recordType}) failed: ${message}`,
        'ERROR'
      );
      return { records: [], error: message };
    }

    for (const bucket of buckets) {
      const value = spec.extractValue(bucket.result);
      if (!Number.isFinite(value) || value <= 0) continue;

      const bucketIndex = Math.round(
        (new Date(bucket.startTime).getTime() - segment.startMs) / DAY_MS
      );
      const dayIndex = segment.firstDayIndex + bucketIndex;
      if (dayIndex > segment.lastDayIndex && segment.overflow === 'drop')
        continue;

      const boundedIndex = Math.min(dayIndex, segment.lastDayIndex);
      const existing = days.get(boundedIndex);
      days.set(boundedIndex, {
        value: (existing?.value ?? 0) + value,
        offsetMinutes: existing?.offsetMinutes ?? segment.offsetMinutes,
      });
    }
  }

  const results: AggregatedHealthRecord[] = [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, day]) => ({
      date: dayLabelAt(parts, dayIndex),
      value: spec.round ? Math.round(day.value) : day.value,
      type: spec.outputType,
      record_utc_offset_minutes: day.offsetMinutes,
    }));

  addLog(
    `[HealthConnectService] ${spec.recordType} aggregation: ${results.length} days across ${segments.length} offset segment(s)`,
    'DEBUG'
  );
  return { records: results };
};

// HC anchors DAYS buckets at the supplied startTime, so callers emitting
// date-only rows must pass a calendar-day boundary (see alignToLocalDayStart).
export const aggregateCumulativeMetricByDayDetailed = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> => {
  try {
    const rangeError = getWindowError(
      `aggregate for ${spec.recordType}`,
      startDate,
      endDate
    );
    if (rangeError) {
      addLog(`[HealthConnectService] ${rangeError}`, 'WARNING');
      return { records: [], error: rangeError };
    }

    // HC prorates interval records to the requested overlap. Some providers expose
    // a daily total as a midnight-to-midnight record, so querying only through
    // "now" returns a partial value. An existing midnight remains unchanged.
    const queryEndDate = ceilToLocalDayStart(endDate);

    const firstProbe = await readEdgeRecord(
      spec.recordType,
      startDate,
      queryEndDate,
      true
    );
    if (firstProbe.outcome === 'empty') {
      addLog(
        `[HealthConnectService] ${spec.recordType} aggregation: no records in range`,
        'DEBUG'
      );
      return { records: [] };
    }

    if (
      firstProbe.outcome === 'record' &&
      firstProbe.offsetMinutes != null &&
      firstProbe.offsetMinutes !== deviceOffsetMinutesAt(firstProbe.instantMs)
    ) {
      const segments = await buildOffsetSegments(
        spec.recordType,
        startDate,
        queryEndDate,
        firstProbe.offsetMinutes
      );
      if (segments) {
        return await aggregateByRecordOffsets(spec, startDate, segments);
      }
      addLog(
        `[HealthConnectService] ${spec.recordType}: record offsets diverge from the device zone but don't form a clean transition; using device-zone buckets`,
        'WARNING'
      );
    }

    const rangeOffsetMinutes =
      firstProbe.outcome === 'record' ? firstProbe.offsetMinutes : undefined;
    return await aggregateByDeviceZone(
      spec,
      startDate,
      queryEndDate,
      rangeOffsetMinutes
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] Error aggregating ${spec.recordType}: ${message}`,
      'ERROR'
    );
    return { records: [], error: message };
  }
};

export const getAggregatedStepsByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'Steps',
      outputType: 'step',
      extractValue: (r) => (r as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? 0,
    },
    startDate,
    endDate
  );

export const getAggregatedStepsByDate = (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedStepsByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

const getNativeActiveCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'ActiveCaloriesBurned',
      outputType: 'active_calories',
      extractValue: (r) =>
        (r as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } })
          .ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate
  );

const getAggregatedBasalCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'BasalMetabolicRate',
      outputType: 'basal_calories',
      extractValue: (r) =>
        (r as { BASAL_CALORIES_TOTAL?: { inKilocalories?: number } })
          .BASAL_CALORIES_TOTAL?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate
  );

/** Prefer reported active energy per day; derive total minus basal only for missing days. */
export const getAggregatedActiveCaloriesByDateDetailed = async (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> => {
  const [activeResult, totalResult] = await Promise.all([
    getNativeActiveCaloriesByDateDetailed(startDate, endDate),
    getAggregatedTotalCaloriesByDateDetailed(startDate, endDate),
  ]);

  const activeDates = new Set(
    activeResult.records.map((record) => record.date)
  );
  const fallbackTotals = totalResult.records.filter(
    (record) => !activeDates.has(record.date)
  );
  let derivedRecords: AggregatedHealthRecord[] = [];
  let basalError: string | undefined;
  if (fallbackTotals.length > 0) {
    const basalResult = await getAggregatedBasalCaloriesByDateDetailed(
      startDate,
      endDate
    );
    basalError = basalResult.error;
    const basalByDate = new Map(
      basalResult.records.map((record) => [record.date, record.value])
    );
    derivedRecords = fallbackTotals.flatMap((totalRecord) => {
      const basal = basalByDate.get(totalRecord.date);
      if (basal == null) return [];
      const derived = deriveActiveCalories(totalRecord.value, basal);
      if (derived == null) return [];
      return [
        {
          ...totalRecord,
          value: Math.round(derived),
          type: 'active_calories',
        },
      ];
    });
  }

  if (derivedRecords.length > 0) {
    addLog(
      '[HealthConnectService] Derived missing active-calorie days from total minus basal calories',
      'DEBUG'
    );
  }
  const expectedDayCount = Math.max(
    0,
    dayIndexSpan(wallClockParts(startDate), endDate) + 1
  );
  const activeDayCount = new Set(
    activeResult.records.map((record) => record.date)
  ).size;
  const activeCoversFullRange = activeDayCount >= expectedDayCount;
  const fallbackDependedOnTotal =
    !activeCoversFullRange || fallbackTotals.length > 0;
  const totalError = fallbackDependedOnTotal ? totalResult.error : undefined;
  const error = activeResult.error ?? totalError ?? basalError;
  const records = [...activeResult.records, ...derivedRecords].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  return { records, ...(error ? { error } : {}) };
};

export const getAggregatedActiveCaloriesByDate = (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedActiveCaloriesByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

export const getAggregatedTotalCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'TotalCaloriesBurned',
      outputType: 'total_calories',
      extractValue: (r) =>
        (r as { ENERGY_TOTAL?: { inKilocalories?: number } }).ENERGY_TOTAL
          ?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate
  );

export const getAggregatedTotalCaloriesByDate = (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedTotalCaloriesByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

export const getAggregatedDistanceByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'Distance',
      outputType: 'distance',
      extractValue: (r) =>
        (r as { DISTANCE?: { inMeters?: number } }).DISTANCE?.inMeters ?? 0,
      round: true,
    },
    startDate,
    endDate
  );

export const getAggregatedDistanceByDate = (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedDistanceByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

export const getAggregatedFloorsClimbedByDateDetailed = (
  startDate: Date,
  endDate: Date
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'FloorsClimbed',
      outputType: 'floors_climbed',
      extractValue: (r) =>
        (r as { FLOORS_CLIMBED_TOTAL?: number }).FLOORS_CLIMBED_TOTAL ?? 0,
    },
    startDate,
    endDate
  );

export const getAggregatedFloorsClimbedByDate = (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedFloorsClimbedByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

// Distance plausibility floor: drop tiny distance aggregates on long sessions —
// Health Sync writes a few dozen meters of passive step-distance over the
// session window for stationary or indoor workouts (issue #1296).
const MIN_DURATION_FOR_DISTANCE_CHECK_MS = 10 * 60 * 1000;
const MIN_DISTANCE_FOR_LONG_SESSION_M = 100;

// Calorie selection thresholds — see selectSessionCalories.
// Citing #593 (Garmin Total includes BMR → prefer Active) and #1296
// (Health Sync Active is passive contamination → prefer Total).
// Known data points: 0.8% (HealthSync bike), 16% (HealthSync walk),
// 87% (Garmin ride), and a HealthSync bike where Active was absent.
const CALORIE_ACTIVE_RATIO_MIN = 0.5;
const CALORIE_BMR_KCAL_PER_MIN_CAP = 2;

const isPositiveCalories = (value: number | undefined): value is number =>
  value != null && value > 0;

const activeCaloriesPassSessionCheck = (
  active: number,
  total: number,
  durationMs: number
): boolean => {
  if (active > total) return false;
  const ratio = active / total;
  const durationMinutes = durationMs / 60_000;
  const delta = total - active;
  const bmrCap = durationMinutes * CALORIE_BMR_KCAL_PER_MIN_CAP;
  return ratio >= CALORIE_ACTIVE_RATIO_MIN || delta <= bmrCap;
};

/**
 * Picks the session calorie value from the Active/Total pair.
 * Treats 0 and undefined as "missing" (Android bridge returns 0.0 for empty ranges).
 *
 * - Both missing → undefined
 * - One present → that one
 * - Both present and (ratio ≥ 0.5 OR delta ≤ duration_min × 2) → Active
 *   (Active is session-aligned; the Total - Active delta is plausibly just BMR)
 * - Otherwise → Total (Active is passive contamination from a separate stream)
 */
export const selectSessionCalories = (
  active: number | undefined,
  total: number | undefined,
  durationMs: number
): number | undefined => {
  const activeValid = isPositiveCalories(active) ? active : undefined;
  const totalValid = isPositiveCalories(total) ? total : undefined;

  if (activeValid == null && totalValid == null) return undefined;
  if (activeValid == null) return totalValid;
  if (totalValid == null) return activeValid;

  if (activeCaloriesPassSessionCheck(activeValid, totalValid, durationMs)) {
    return activeValid;
  }
  return totalValid;
};

const shouldTryCrossOriginCalories = (
  active: number | undefined,
  total: number | undefined,
  durationMs: number
): boolean => {
  if (!isPositiveCalories(active) || !isPositiveCalories(total)) return true;
  return !activeCaloriesPassSessionCheck(active, total, durationMs);
};

type SessionCaloriePair = {
  active?: number;
  total?: number;
};

const selectBasalNormalizedSessionCalories = (
  active: number | undefined,
  total: number | undefined,
  basal: number | undefined,
  durationMs: number
): number | undefined => {
  const totalValid = isPositiveCalories(total) ? total : undefined;
  const basalValid =
    basal != null && Number.isFinite(basal) && basal >= 0 ? basal : undefined;
  if (totalValid == null || basalValid == null) {
    return selectSessionCalories(active, total, durationMs);
  }

  const reportedActive =
    isPositiveCalories(active) && active <= totalValid ? active : undefined;
  const derivedActive = deriveActiveCalories(totalValid, basalValid);
  const derivedPositive =
    derivedActive != null && derivedActive > 0 ? derivedActive : undefined;

  if (derivedPositive == null) {
    return selectSessionCalories(active, total, durationMs);
  }
  if (reportedActive == null) return derivedPositive;
  return Math.max(reportedActive, derivedPositive);
};

const extractSessionCaloriePair = (
  activeResult: PromiseSettledResult<unknown>,
  totalResult: PromiseSettledResult<unknown>
): SessionCaloriePair => ({
  active:
    activeResult.status === 'fulfilled'
      ? (
          activeResult.value as {
            ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number };
          }
        ).ACTIVE_CALORIES_TOTAL?.inKilocalories
      : undefined,
  total:
    totalResult.status === 'fulfilled'
      ? (totalResult.value as { ENERGY_TOTAL?: { inKilocalories?: number } })
          .ENERGY_TOTAL?.inKilocalories
      : undefined,
});

/**
 * Distance is plausible unless the session is long enough that a real workout
 * would have covered more than a token amount.
 */
export const isPlausibleSessionDistance = (
  meters: number,
  durationMs: number
): boolean => {
  if (durationMs <= MIN_DURATION_FOR_DISTANCE_CHECK_MS) return true;
  return meters >= MIN_DISTANCE_FOR_LONG_SESSION_M;
};

/**
 * Enriches raw exercise session records with calories and distance data.
 * Health Connect stores these as separate record types, so we query
 * ActiveCaloriesBurned, TotalCaloriesBurned, BasalMetabolicRate, and Distance
 * over each session's time range. Total minus basal is compared as an active-
 * energy candidate before applying legacy plausibility fallbacks (see #593,
 * #1296, #2295).
 */
export const enrichExerciseSessions = async (
  records: unknown[],
  telemetry: TelemetryRunContext
): Promise<unknown[]> => {
  if (records.length === 0) return records;

  addLog(
    `[HealthConnectService] Enriching ${records.length} exercise session(s) with calories/distance`,
    'DEBUG'
  );

  const ctx = telemetry;

  // Budget slots are assigned newest-first before any read starts. Claiming
  // inside the concurrent map below would award them in Promise completion
  // order instead — whichever session's aggregate reads happen to resolve
  // first — so a capped background run could spend its budget on old sessions
  // while the newest go unenriched.
  const telemetryAllowed = new Set<unknown>();
  const byNewest = [...records].sort((a, b) => {
    const aStart = (a as { startTime?: string }).startTime ?? '';
    const bStart = (b as { startTime?: string }).startTime ?? '';
    return bStart.localeCompare(aStart);
  });
  const startedAtMs = Date.now();
  let skippedInvalid = 0;
  let skippedAlreadyCollected = 0;
  for (const record of byNewest) {
    const rec = record as Record<string, unknown>;
    if (typeof rec.startTime !== 'string' || typeof rec.endTime !== 'string') {
      skippedInvalid++;
      continue;
    }
    // Claimed slots are never refunded, so a record the enrichment loop below
    // would reject for an invalid window must not consume one.
    const startMs = Date.parse(rec.startTime);
    const endMs = Date.parse(rec.endTime);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      skippedInvalid++;
      continue;
    }
    // Already-collected sessions neither consume a slot nor get re-read, so a
    // bounded budget works through the backlog across syncs instead of
    // re-picking the same newest few every run (#2191).
    if (await hasEnrichedSession(sessionCacheKey(record))) {
      skippedAlreadyCollected++;
      continue;
    }
    if (!ctx.claim()) break;
    telemetryAllowed.add(record);
  }

  // Bounded fan-out. An unbounded Promise.all over a busy window issued well
  // over a hundred concurrent native calls, whose results are deserialized and
  // sorted on the JS thread, which starves the UI until they drain (#2191).
  // The expensive half is capped separately by limitTelemetry below.
  const settled = await runTasksInBatches(
    records,
    AGGREGATE_CONCURRENCY,
    async (record) => {
      const rec = record as Record<string, unknown>;
      const startTime = rec.startTime as string | undefined;
      const endTime = rec.endTime as string | undefined;
      if (!startTime || !endTime) return record;

      const metadata = rec.metadata as { dataOrigin?: string } | undefined;
      const dataOriginFilter = metadata?.dataOrigin
        ? [metadata.dataOrigin]
        : undefined;

      const timeRangeFilter = {
        operator: 'between' as const,
        startTime,
        endTime,
      };

      const durationMs =
        new Date(endTime).getTime() - new Date(startTime).getTime();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return record;
      }

      // Start activity and total energy at the session origin, matching Health
      // Connect's associated-session guidance and preventing another concurrent
      // activity from donating energy or distance. Basal energy is intentionally
      // unfiltered because it comes from the user's metabolism source, not the
      // workout writer. If the origin has an incomplete or implausible calorie pair,
      // retry activity and total energy without an origin filter so Health Connect
      // can apply the user's Activity source priority (for example, Hevy session +
      // Samsung calories).
      const [
        activeCaloriesResult,
        totalCaloriesResult,
        basalCaloriesResult,
        distanceResult,
        stepsResult,
      ] = await Promise.allSettled([
        aggregateRecord({
          recordType: 'ActiveCaloriesBurned',
          timeRangeFilter,
          dataOriginFilter,
        }),
        aggregateRecord({
          recordType: 'TotalCaloriesBurned',
          timeRangeFilter,
          dataOriginFilter,
        }),
        aggregateRecord({
          recordType: 'BasalMetabolicRate',
          timeRangeFilter,
        }),
        aggregateRecord({
          recordType: 'Distance',
          timeRangeFilter,
          dataOriginFilter,
        }),
        // Only the session writer's steps belong to this workout. An unfiltered
        // time-window query would misclassify incidental steps during a Hevy
        // strength session as workout steps and suppress valid step calories.
        dataOriginFilter
          ? aggregateRecord({
              recordType: 'Steps',
              timeRangeFilter,
              dataOriginFilter,
            })
          : Promise.resolve(null),
      ]);

      // Only attach enriched values when an aggregate call succeeded and returned
      // a plausible value. Leave the record untouched otherwise so we don't
      // overwrite potentially valid data with a synthetic zero.
      const enrichedFields: Record<string, unknown> = {};

      const scopedCalories = extractSessionCaloriePair(
        activeCaloriesResult,
        totalCaloriesResult
      );
      const basalCalories =
        basalCaloriesResult.status === 'fulfilled'
          ? (
              basalCaloriesResult.value as {
                BASAL_CALORIES_TOTAL?: { inKilocalories?: number };
              }
            ).BASAL_CALORIES_TOTAL?.inKilocalories
          : undefined;
      let kcal = selectBasalNormalizedSessionCalories(
        scopedCalories.active,
        scopedCalories.total,
        basalCalories,
        durationMs
      );
      if (
        dataOriginFilter &&
        shouldTryCrossOriginCalories(
          scopedCalories.active,
          scopedCalories.total,
          durationMs
        )
      ) {
        const [unfilteredActiveResult, unfilteredTotalResult] =
          await Promise.allSettled([
            aggregateRecord({
              recordType: 'ActiveCaloriesBurned',
              timeRangeFilter,
            }),
            aggregateRecord({
              recordType: 'TotalCaloriesBurned',
              timeRangeFilter,
            }),
          ]);
        const unfilteredCalories = extractSessionCaloriePair(
          unfilteredActiveResult,
          unfilteredTotalResult
        );
        const unfilteredKcal = selectBasalNormalizedSessionCalories(
          unfilteredCalories.active,
          unfilteredCalories.total,
          basalCalories,
          durationMs
        );
        if (unfilteredKcal != null && (kcal == null || unfilteredKcal > kcal)) {
          kcal = unfilteredKcal;
        }
      }

      if (kcal != null) {
        enrichedFields.energy = { inKilocalories: kcal };
      }

      if (distanceResult.status === 'fulfilled') {
        const result = distanceResult.value as {
          DISTANCE?: { inMeters?: number };
        };
        const meters = result.DISTANCE?.inMeters;
        if (meters != null && isPlausibleSessionDistance(meters, durationMs)) {
          enrichedFields.distance = { inMeters: meters };
        }
      }

      if (stepsResult.status === 'fulfilled' && stepsResult.value !== null) {
        const steps = (stepsResult.value as { COUNT_TOTAL?: number })
          .COUNT_TOTAL;
        if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) {
          enrichedFields.steps = Math.round(steps);
        }
      }

      // Route + series collection. Interactive only when a user is present:
      // reading a route can prompt for per-session consent, which a headless
      // background task cannot present. Sessions skipped here are re-sent with
      // telemetry on a later interactive sync (while they remain inside the 6h
      // overlap window) and upserted in place server-side.
      if (telemetryAllowed.has(record)) {
        const bundle = await limitTelemetry(() =>
          collectSessionTelemetry(rec, {
            interactive: ctx.interactive,
          })
        );
        if (bundle.gps_points) enrichedFields.gps_points = bundle.gps_points;
        if (bundle.hr_samples) enrichedFields.hr_samples = bundle.hr_samples;
        if (bundle.laps) enrichedFields.laps = bundle.laps;
        if (bundle.telemetry) {
          const telemetry: Record<string, unknown> = { ...bundle.telemetry };
          if (kcal != null) telemetry.active_calories = kcal;
          enrichedFields.telemetry = telemetry;
        }
        // Recorded even when the session turned out to have nothing beyond its
        // summary: the reads that established that are exactly what we must not
        // repeat every sync. A later edit to the record changes its cache key.
        //
        // Not recorded when the bundle came back `incomplete` — a failed read is
        // not the same answer as an empty one, and this cache has no expiry, so
        // caching a transient failure strands the session's telemetry for good.
        //
        // Interactive runs only. A headless run cannot present the per-session
        // route-consent dialog, so collectSessionRoute returns no route for a
        // session awaiting consent — caching that would make the next foreground
        // sync skip it and the route would never be collected at all.
        if (ctx.interactive && !bundle.incomplete) {
          ctx.stageCollected(sessionCacheKey(record));
        }
      }

      return Object.keys(enrichedFields).length > 0
        ? { ...rec, ...enrichedFields }
        : record;
    }
  );

  // Index-aligned with `records`; a rejected task keeps the original record so
  // a telemetry failure never drops a session from the sync.
  const enriched = settled.map((result, index) =>
    result.status === 'fulfilled' ? result.value : records[index]
  );

  // Batching must not change failure semantics: Promise.all rejected the whole
  // read before, which surfaced as a metric error and held the sync cursor so
  // the window is retried. Swallowing the rejection here would advance the
  // cursor past a session we never actually read.
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure && failure.status === 'rejected') {
    addLog(
      `[HealthConnectService] Exercise session enrichment failed: ${getErrorMessage(failure.reason)}`,
      'ERROR'
    );
    throw failure.reason;
  }

  // One summary line per run, so the budget and the reuse cache are visible in
  // the in-app log and in the exported diagnostic. This is the field-verifiable
  // signal for #2191: on a healthy run the telemetry count is bounded and the
  // "already collected" count carries the rest.
  const overBudget =
    records.length -
    skippedInvalid -
    skippedAlreadyCollected -
    telemetryAllowed.size;
  addLog(
    `[HealthConnectService] Enriched ${records.length} session(s) in ${Date.now() - startedAtMs}ms ` +
      `(telemetry: ${telemetryAllowed.size}, already collected: ${skippedAlreadyCollected}, ` +
      `over budget: ${Math.max(overBudget, 0)}, invalid: ${skippedInvalid})`,
    'INFO'
  );

  return enriched;
};
