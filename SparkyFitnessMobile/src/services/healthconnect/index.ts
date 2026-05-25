import {
  initialize,
  requestPermission,
  readRecords,
  aggregateRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import {
  AggregatedHealthRecord,
  PermissionRequest,
  GrantedPermission,
  type HCZoneOffset,
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
const FALLBACK_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FALLBACK_HOUR_WINDOW_MS = 60 * 60 * 1000;

interface ReadRecordsOptions {
  timeRangeFilter: {
    operator: 'between';
    startTime: string;
    endTime: string;
  };
  pageSize: number;
  pageToken?: string;
}

export interface HealthConnectReadResult {
  records: unknown[];
  error?: string;
}

export interface HealthConnectAggregateResult {
  records: AggregatedHealthRecord[];
  error?: string;
}

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
): Promise<HealthConnectReadResult & { failedOnFirstPage: boolean }> => {
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
    addLog(
      `[HealthConnectService] Failed reading ${recordType} on page ${page}: ${message}. Returning ${allRecords.length} records collected so far.`,
      'ERROR'
    );
    return { records: allRecords, error: message, failedOnFirstPage: page <= 1 && allRecords.length === 0 };
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
 * Iterates local-day windows in [startDate, endDate] and aggregates a
 * cumulative metric via Health Connect's native aggregateRecord. HC's
 * native aggregation handles cross-origin dedup using the user's source
 * priority list — matching what HC's own UI displays — so callers do not
 * need to deduplicate records themselves (issue #1279).
 *
 * Reads one raw record per day separately to capture the day's UTC offset,
 * preserving the per-day `record_utc_offset_minutes` metadata that the
 * server uses for timezone-aware day attribution.
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

interface LocalDayWindow {
  dayString: string;
  windowStart: Date;
  windowEnd: Date;
}

const formatLocalDay = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const localDayWindows = (start: Date, end: Date): LocalDayWindow[] => {
  const windows: LocalDayWindow[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const dayStart = new Date(cursor);
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);
    const windowStart = dayStart < start ? start : dayStart;
    const windowEnd = nextDay > end ? end : nextDay;
    if (windowEnd > windowStart) {
      windows.push({
        dayString: formatLocalDay(dayStart),
        windowStart,
        windowEnd,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
};

/**
 * Reads a single record in the given window for the sole purpose of
 * capturing its UTC offset. Returns undefined if no record / no offset.
 */
const readZoneOffsetForWindow = async (
  recordType: CumulativeMetricRecordType,
  windowStart: Date,
  windowEnd: Date,
): Promise<number | undefined> => {
  try {
    if (getWindowError(`offset read for ${recordType}`, windowStart, windowEnd)) {
      return undefined;
    }
    const result = await readRecords(
      recordType as Parameters<typeof readRecords>[0],
      {
        timeRangeFilter: {
          operator: 'between',
          startTime: windowStart.toISOString(),
          endTime: windowEnd.toISOString(),
        },
        pageSize: 1,
      } as unknown as Parameters<typeof readRecords>[1],
    );
    type OffsetRecord = { startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset };
    const record = (result.records as OffsetRecord[])[0];
    const offset = record?.endZoneOffset ?? record?.startZoneOffset;
    if (offset?.totalSeconds != null) {
      return Math.round(offset.totalSeconds / 60);
    }
    return undefined;
  } catch {
    return undefined;
  }
};

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

    const windows = localDayWindows(startDate, endDate);
    const results: AggregatedHealthRecord[] = [];
    const errors: string[] = [];

    for (const { dayString, windowStart, windowEnd } of windows) {
      let value: number;
      try {
        const windowError = getWindowError(`aggregate for ${spec.recordType}`, windowStart, windowEnd);
        if (windowError) {
          errors.push(`${dayString}: ${windowError}`);
          addLog(`[HealthConnectService] ${windowError}`, 'WARNING');
          continue;
        }

        const aggregate = await aggregateRecord({
          recordType: spec.recordType as Parameters<typeof aggregateRecord>[0]['recordType'],
          timeRangeFilter: {
            operator: 'between',
            startTime: windowStart.toISOString(),
            endTime: windowEnd.toISOString(),
          },
        });
        value = spec.extractValue(aggregate);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[HealthConnectService] aggregateRecord(${spec.recordType}) failed for ${dayString}: ${message}`, 'WARNING');
        errors.push(`${dayString}: ${message}`);
        continue;
      }

      if (!Number.isFinite(value) || value <= 0) continue;

      const offset = await readZoneOffsetForWindow(spec.recordType, windowStart, windowEnd);
      const rec: AggregatedHealthRecord = {
        date: dayString,
        value: spec.round ? Math.round(value) : value,
        type: spec.outputType,
      };
      if (offset != null) {
        rec.record_utc_offset_minutes = offset;
      }
      results.push(rec);
    }

    addLog(`[HealthConnectService] ${spec.recordType} aggregation: ${results.length} days`, 'DEBUG');
    if (errors.length > 0) {
      return {
        records: results,
        error: `${spec.recordType} aggregation failed for ${errors.length} window(s). First error: ${errors[0]}`,
      };
    }
    return { records: results };
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
