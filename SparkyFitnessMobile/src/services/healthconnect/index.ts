import {
  initialize,
  requestPermission,
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
import { getSyncStartDate } from '../../utils/syncUtils';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };

export const initHealthConnect = async (): Promise<boolean> => {
  try {
    const isInitialized = await initialize();
    return isInitialized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to initialize Health Connect: ${message}`);
    return false;
  }
};

export const requestHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<boolean> => {
  try {
    const uniquePermissions = permissionsToRequest.filter((permission, index, allPermissions) =>
      allPermissions.findIndex(candidate =>
        candidate.recordType === permission.recordType &&
        candidate.accessType === permission.accessType
      ) === index
    );

    // Cast to library's Permission type - our PermissionRequest interface is compatible
    const grantedPermissions = await requestPermission(
      uniquePermissions as Parameters<typeof requestPermission>[0]
    ) as GrantedPermission[];

    const allGranted = uniquePermissions.every(requestedPerm =>
      grantedPermissions.some(grantedPerm =>
        grantedPerm.recordType === requestedPerm.recordType &&
        grantedPerm.accessType === requestedPerm.accessType
      )
    );

    if (allGranted) {
      console.log('[HealthConnectService] All requested permissions granted.');
      return true;
    } else {
      console.log('[HealthConnectService] Not all requested permissions granted.', { requested: permissionsToRequest, granted: grantedPermissions });
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to request health permissions: ${message}`, 'ERROR');
    throw error;
  }
};

const PAGE_SIZE = 5000;
const MAX_PAGES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_DAY_WINDOW_MS = DAY_MS;
const FALLBACK_HOUR_WINDOW_MS = 60 * 60 * 1000;

// Health Connect enforces a foreground API call quota; once exceeded, every
// subsequent call fails with "API call quota exceeded". Splitting the failed
// range into more sub-windows (the normal fallback path) just multiplies the
// call rate and prolongs the outage, so we short-circuit on quota errors.
const QUOTA_ERROR_PATTERNS = [/quota exceeded/i, /api call quota/i];

export const isQuotaExceededError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

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
  endDate: Date,
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
  windowMs: number,
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
): Promise<HealthConnectReadResult & { failedOnFirstPage: boolean; quotaExceeded?: boolean }> => {
  const allRecords: unknown[] = [];
  let pageToken: string | undefined;
  let page = 0;
  const windowError = getWindowError(`read for ${recordType}`, startDate, endDate);
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
      addLog(`[HealthConnectService] Read ${allRecords.length} ${recordType} records across ${page} pages`);
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
    addLog(
      `[HealthConnectService] Failed reading ${recordType} on page ${page}: ${message}. Returning ${allRecords.length} records collected so far.`,
      'ERROR'
    );
    return {
      records: allRecords,
      error: message,
      failedOnFirstPage: page <= 1 && allRecords.length === 0,
      quotaExceeded,
    };
  }
};

const readHealthRecordsFallback = async (
  recordType: string,
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectReadResult> => {
  const records: unknown[] = [];
  const errors: string[] = [];
  const dayWindows = buildFallbackWindows(startDate, endDate, FALLBACK_DAY_WINDOW_MS);

  addLog(
    `[HealthConnectService] Retrying ${recordType} read in ${dayWindows.length} day window(s) after a page-1 failure.`,
    'WARNING',
  );

  for (const dayWindow of dayWindows) {
    const dayResult = await readHealthRecordsOnce(recordType, dayWindow.start, dayWindow.end);
    if (!dayResult.error) {
      records.push(...dayResult.records);
      continue;
    }

    const durationMs = dayWindow.end.getTime() - dayWindow.start.getTime();
    if (dayResult.failedOnFirstPage && durationMs > FALLBACK_HOUR_WINDOW_MS) {
      const hourWindows = buildFallbackWindows(dayWindow.start, dayWindow.end, FALLBACK_HOUR_WINDOW_MS);
      for (const hourWindow of hourWindows) {
        const hourResult = await readHealthRecordsOnce(recordType, hourWindow.start, hourWindow.end);
        records.push(...hourResult.records);
        if (hourResult.error) {
          errors.push(
            `${formatDateForLog(hourWindow.start)}-${formatDateForLog(hourWindow.end)}: ${hourResult.error}`,
          );
        }
      }
      continue;
    }

    records.push(...dayResult.records);
    errors.push(
      `${formatDateForLog(dayWindow.start)}-${formatDateForLog(dayWindow.end)}: ${dayResult.error}`,
    );
  }

  if (errors.length === 0) {
    addLog(`[HealthConnectService] Recovered ${records.length} ${recordType} records using fallback windows.`, 'WARNING');
    return { records };
  }

  const error = `Failed reading ${errors.length} fallback ${recordType} window(s); returning ${records.length} records collected. First error: ${errors[0]}`;
  addLog(`[HealthConnectService] ${error}`, 'ERROR');
  return { records, error };
};

export const readHealthRecordsDetailed = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<HealthConnectReadResult> => {
  const result = await readHealthRecordsOnce(recordType, startDate, endDate);

  if (!result.error || !result.failedOnFirstPage) {
    return { records: result.records, error: result.error };
  }

  // Splitting into smaller windows would multiply the call rate and keep us
  // pinned against the quota. Surface the original error instead.
  if (result.quotaExceeded) {
    addLog(
      `[HealthConnectService] Skipping fallback split for ${recordType}: Health Connect quota exceeded.`,
      'WARNING',
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
  const result = await readHealthRecordsDetailed(recordType, startDate, endDate);
  return result.records;
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
  ascending: boolean,
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
      } as unknown as Parameters<typeof readRecords>[1],
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
    const startMs = record.startTime ? new Date(record.startTime).getTime() : NaN;
    const endMs = record.endTime ? new Date(record.endTime).getTime() : NaN;
    if (record.startZoneOffset?.totalSeconds != null && Number.isFinite(startMs)) {
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
  offsetMinutes: number,
): number =>
  Date.UTC(
    parts.year,
    parts.month,
    parts.day + dayShift,
    parts.hour,
    parts.minute,
    parts.second,
    parts.ms,
  ) -
  offsetMinutes * 60_000;

/** YYYY-MM-DD label of the wall clock shifted by dayShift days. */
const dayLabelAt = (parts: WallClockParts, dayShift: number): string => {
  const shifted = new Date(Date.UTC(parts.year, parts.month, parts.day + dayShift));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Index of endDate's calendar day relative to the parts' day (day 0). */
const dayIndexSpan = (parts: WallClockParts, endDate: Date): number => {
  const end = wallClockParts(endDate);
  return Math.round(
    (Date.UTC(end.year, end.month, end.day) - Date.UTC(parts.year, parts.month, parts.day)) /
      DAY_MS,
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
  endDate: Date,
): Promise<number | undefined> => {
  let lo = 1;
  let hi = lastDayIndex + 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const probeStart = Math.min(
      instantAtOffset(parts, mid, off0),
      instantAtOffset(parts, mid, off1),
    );
    const probe = await readEdgeRecord(recordType, new Date(probeStart), endDate, true);
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
  firstOffsetMinutes: number,
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
    endDate,
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
  rangeOffsetMinutes: number | undefined,
): Promise<HealthConnectAggregateResult> => {
  type PeriodBucket = { result: unknown; startTime: string; endTime: string };
  let buckets: PeriodBucket[];
  try {
    buckets = (await aggregateGroupByPeriod({
      recordType: spec.recordType as Parameters<typeof aggregateGroupByPeriod>[0]['recordType'],
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
      'ERROR',
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

  addLog(`[HealthConnectService] ${spec.recordType} aggregation: ${results.length} days`, 'DEBUG');
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
  segments: AggregationSegment[],
): Promise<HealthConnectAggregateResult> => {
  const parts = wallClockParts(startDate);
  const days = new Map<number, { value: number; offsetMinutes: number }>();

  for (const segment of segments) {
    type DurationBucket = { result: unknown; startTime: string; endTime: string };
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
        'ERROR',
      );
      return { records: [], error: message };
    }

    for (const bucket of buckets) {
      const value = spec.extractValue(bucket.result);
      if (!Number.isFinite(value) || value <= 0) continue;

      const bucketIndex = Math.round(
        (new Date(bucket.startTime).getTime() - segment.startMs) / DAY_MS,
      );
      const dayIndex = segment.firstDayIndex + bucketIndex;
      if (dayIndex > segment.lastDayIndex && segment.overflow === 'drop') continue;

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
    'DEBUG',
  );
  return { records: results };
};

// HC anchors DAYS buckets at the supplied startTime, so callers emitting
// date-only rows must pass a calendar-day boundary (see alignToLocalDayStart).
export const aggregateCumulativeMetricByDayDetailed = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> => {
  try {
    const rangeError = getWindowError(`aggregate for ${spec.recordType}`, startDate, endDate);
    if (rangeError) {
      addLog(`[HealthConnectService] ${rangeError}`, 'WARNING');
      return { records: [], error: rangeError };
    }

    const firstProbe = await readEdgeRecord(spec.recordType, startDate, endDate, true);
    if (firstProbe.outcome === 'empty') {
      addLog(
        `[HealthConnectService] ${spec.recordType} aggregation: no records in range`,
        'DEBUG',
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
        endDate,
        firstProbe.offsetMinutes,
      );
      if (segments) {
        return await aggregateByRecordOffsets(spec, startDate, segments);
      }
      addLog(
        `[HealthConnectService] ${spec.recordType}: record offsets diverge from the device zone but don't form a clean transition; using device-zone buckets`,
        'WARNING',
      );
    }

    const rangeOffsetMinutes =
      firstProbe.outcome === 'record' ? firstProbe.offsetMinutes : undefined;
    return await aggregateByDeviceZone(spec, startDate, endDate, rangeOffsetMinutes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error aggregating ${spec.recordType}: ${message}`, 'ERROR');
    return { records: [], error: message };
  }
};

export const aggregateCumulativeMetricByDay = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> => {
  const result = await aggregateCumulativeMetricByDayDetailed(spec, startDate, endDate);
  return result.records;
};

export const getAggregatedStepsByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'Steps',
      outputType: 'step',
      extractValue: (r) => (r as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? 0,
    },
    startDate,
    endDate,
  );

export const getAggregatedStepsByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedStepsByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedActiveCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'ActiveCaloriesBurned',
      outputType: 'active_calories',
      extractValue: (r) => (r as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } }).ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate,
  );

export const getAggregatedActiveCaloriesByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedActiveCaloriesByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedTotalCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'TotalCaloriesBurned',
      outputType: 'total_calories',
      extractValue: (r) => (r as { ENERGY_TOTAL?: { inKilocalories?: number } }).ENERGY_TOTAL?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate,
  );

export const getAggregatedTotalCaloriesByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedTotalCaloriesByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedDistanceByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'Distance',
      outputType: 'distance',
      extractValue: (r) => (r as { DISTANCE?: { inMeters?: number } }).DISTANCE?.inMeters ?? 0,
      round: true,
    },
    startDate,
    endDate,
  );

export const getAggregatedDistanceByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedDistanceByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedFloorsClimbedByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnectAggregateResult> =>
  aggregateCumulativeMetricByDayDetailed(
    {
      recordType: 'FloorsClimbed',
      outputType: 'floors_climbed',
      extractValue: (r) => (r as { FLOORS_CLIMBED_TOTAL?: number }).FLOORS_CLIMBED_TOTAL ?? 0,
    },
    startDate,
    endDate,
  );

export const getAggregatedFloorsClimbedByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedFloorsClimbedByDateDetailed(startDate, endDate).then(result => result.records);

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
  durationMs: number,
): number | undefined => {
  const activeValid = active != null && active > 0 ? active : undefined;
  const totalValid = total != null && total > 0 ? total : undefined;

  if (activeValid == null && totalValid == null) return undefined;
  if (activeValid == null) return totalValid;
  if (totalValid == null) return activeValid;

  const ratio = activeValid / totalValid;
  const durationMinutes = durationMs / 60_000;
  const delta = totalValid - activeValid;
  const bmrCap = durationMinutes * CALORIE_BMR_KCAL_PER_MIN_CAP;

  if (ratio >= CALORIE_ACTIVE_RATIO_MIN || delta <= bmrCap) {
    return activeValid;
  }
  return totalValid;
};

/**
 * Distance is plausible unless the session is long enough that a real workout
 * would have covered more than a token amount.
 */
export const isPlausibleSessionDistance = (meters: number, durationMs: number): boolean => {
  if (durationMs <= MIN_DURATION_FOR_DISTANCE_CHECK_MS) return true;
  return meters >= MIN_DISTANCE_FOR_LONG_SESSION_M;
};

/**
 * Enriches raw exercise session records with calories and distance data.
 * Health Connect stores these as separate record types, so we query
 * ActiveCaloriesBurned, TotalCaloriesBurned, and Distance aggregated over
 * each session's time range and apply plausibility checks (see #593, #1296).
 */
export const enrichExerciseSessions = async (records: unknown[]): Promise<unknown[]> => {
  if (records.length === 0) return records;

  addLog(`[HealthConnectService] Enriching ${records.length} exercise session(s) with calories/distance`, 'DEBUG');

  const enriched = await Promise.all(records.map(async (record) => {
    const rec = record as Record<string, unknown>;
    const startTime = rec.startTime as string | undefined;
    const endTime = rec.endTime as string | undefined;
    if (!startTime || !endTime) return record;

    const metadata = rec.metadata as { dataOrigin?: string } | undefined;
    const dataOriginFilter = metadata?.dataOrigin ? [metadata.dataOrigin] : undefined;

    const timeRangeFilter = {
      operator: 'between' as const,
      startTime,
      endTime,
    };

    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return record;
    }

    const [activeCaloriesResult, totalCaloriesResult, distanceResult] = await Promise.allSettled([
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
        recordType: 'Distance',
        timeRangeFilter,
        dataOriginFilter,
      }),
    ]);

    // Only attach enriched values when an aggregate call succeeded and returned
    // a plausible value. Leave the record untouched otherwise so we don't
    // overwrite potentially valid data with a synthetic zero.
    const enrichedFields: Record<string, unknown> = {};

    const active = activeCaloriesResult.status === 'fulfilled'
      ? (activeCaloriesResult.value as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } }).ACTIVE_CALORIES_TOTAL?.inKilocalories
      : undefined;
    const total = totalCaloriesResult.status === 'fulfilled'
      ? (totalCaloriesResult.value as { ENERGY_TOTAL?: { inKilocalories?: number } }).ENERGY_TOTAL?.inKilocalories
      : undefined;

    const kcal = selectSessionCalories(active, total, durationMs);
    if (kcal != null) {
      enrichedFields.energy = { inKilocalories: kcal };
    }

    if (distanceResult.status === 'fulfilled') {
      const result = distanceResult.value as { DISTANCE?: { inMeters?: number } };
      const meters = result.DISTANCE?.inMeters;
      if (meters != null && isPlausibleSessionDistance(meters, durationMs)) {
        enrichedFields.distance = { inMeters: meters };
      }
    }

    return Object.keys(enrichedFields).length > 0
      ? { ...rec, ...enrichedFields }
      : record;
  }));

  return enriched;
};
