import {
  initialize,
  requestPermission,
  readRecords,
  aggregateRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { HEALTH_METRICS } from '../../HealthMetrics';
import {
  aggregateStepsByDate,
  aggregateActiveCaloriesByDate,
  aggregateTotalCaloriesByDate,
  aggregateByDay,
} from './dataAggregation';
import { transformHealthRecords } from './dataTransformation';
import {
  AggregatedHealthRecord,
  PermissionRequest,
  GrantedPermission,
  SyncResult,
  HealthMetricStates,
  type TransformedRecord,
  type HCZoneOffset,
} from '../../types/healthRecords';
import { SyncDuration, getSyncStartDate } from '../../utils/syncUtils';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };

/**
 * Deduplicates cumulative records by taking the max total per data origin for each day.
 * When multiple apps (phone, watch, Google Fit) write overlapping data, naive summation
 * double-counts. This groups by origin and takes the highest source total per day.
 *
 * Note: aggregateGroupByPeriod would handle this natively, but react-native-health-connect
 * v3.5.0 has a bug where it uses Instant instead of LocalDateTime (issues #174, #194).
 */
export const deduplicateByOrigin = (
  records: { metadata?: { dataOrigin?: string }; [key: string]: unknown }[],
  getDate: (record: any) => string,
  getValue: (record: any) => number,
): Record<string, number> => {
  // Build: { date: { origin: total } }, skipping records with no valid date
  const byDateAndOrigin: Record<string, Record<string, number>> = {};
  for (const record of records) {
    const date = getDate(record);
    if (!date) continue;
    const origin = record.metadata?.dataOrigin || 'unknown';
    const value = getValue(record);
    if (!byDateAndOrigin[date]) byDateAndOrigin[date] = {};
    byDateAndOrigin[date][origin] = (byDateAndOrigin[date][origin] || 0) + value;
  }
  // For each date, take the max across origins
  const result: Record<string, number> = {};
  for (const [date, origins] of Object.entries(byDateAndOrigin)) {
    result[date] = Math.max(...Object.values(origins));
  }
  return result;
};

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

interface ReadRecordsOptions {
  timeRangeFilter: {
    operator: 'between';
    startTime: string;
    endTime: string;
  };
  pageSize: number;
  pageToken?: string;
}

export const readHealthRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> => {
  const allRecords: unknown[] = [];
  let pageToken: string | undefined;
  let page = 0;

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
    if (page >= MAX_PAGES) {
      addLog(`[HealthConnectService] Hit max page limit (${MAX_PAGES}) for ${recordType}`, 'WARNING');
    }

    return allRecords;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthConnectService] Failed reading ${recordType} on page ${page}: ${message}. Returning ${allRecords.length} records collected so far.`,
      'ERROR'
    );
    return allRecords;
  }
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

export const aggregateCumulativeMetricByDay = async (
  spec: CumulativeMetricSpec,
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> => {
  try {
    const windows = localDayWindows(startDate, endDate);
    const results: AggregatedHealthRecord[] = [];

    for (const { dayString, windowStart, windowEnd } of windows) {
      let value: number;
      try {
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
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error aggregating ${spec.recordType}: ${message}`, 'ERROR');
    return [];
  }
};

export const getAggregatedStepsByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  aggregateCumulativeMetricByDay(
    {
      recordType: 'Steps',
      outputType: 'step',
      extractValue: (r) => (r as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? 0,
    },
    startDate,
    endDate,
  );

export const getAggregatedActiveCaloriesByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  aggregateCumulativeMetricByDay(
    {
      recordType: 'ActiveCaloriesBurned',
      outputType: 'active_calories',
      extractValue: (r) => (r as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } }).ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
      round: true,
    },
    startDate,
    endDate,
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

export const syncHealthData = async (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {},
  api: { syncHealthData: (data: unknown[]) => Promise<unknown> }
): Promise<SyncResult> => {
  const startDate = getSyncStartDate(syncDuration);
  const endDate = new Date();

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const healthDataTypesToSync = HEALTH_METRICS
    .filter(metric => enabledMetricStates[metric.stateKey])
    .map(metric => metric.recordType);

  let allTransformedData: unknown[] = [];
  const syncErrors: { type: string; error: string }[] = [];

  for (const type of healthDataTypesToSync) {
    try {
      const rawRecords = await readHealthRecords(type, startDate, endDate);

      if (rawRecords.length === 0) {
        continue;
      }

      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'WARNING');
        continue;
      }

      let dataToTransform: unknown[] = rawRecords;

      if (type === 'Steps') {
        dataToTransform = aggregateStepsByDate(rawRecords as Parameters<typeof aggregateStepsByDate>[0]);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = aggregateActiveCaloriesByDate(rawRecords as Parameters<typeof aggregateActiveCaloriesByDate>[0]);
      } else if (type === 'TotalCaloriesBurned') {
        dataToTransform = aggregateTotalCaloriesByDate(rawRecords as Parameters<typeof aggregateTotalCaloriesByDate>[0]);
      } else if (type === 'ExerciseSession') {
        dataToTransform = await enrichExerciseSessions(rawRecords);
      }

      const transformed = transformHealthRecords(dataToTransform, metricConfig);

      if (metricConfig.aggregationStrategy) {
        const aggregated = aggregateByDay(
          transformed as TransformedRecord[],
          metricConfig.type,
          metricConfig.unit,
          metricConfig.aggregationStrategy,
        );
        if (aggregated.length > 0) {
          allTransformedData = allTransformedData.concat(aggregated);
        }
      } else if (transformed.length > 0) {
        allTransformedData = allTransformedData.concat(transformed);
      } else {
        addLog(`[HealthConnectService] No ${type} records were transformed (all may have been invalid)`, 'WARNING');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `Error reading or transforming ${type} records: ${message}`;
      addLog(`[HealthConnectService] ${errorMsg}`, 'ERROR');
      syncErrors.push({ type, error: message });
    }
  }

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthConnectService] Error sending data to server: ${message}`);
      return { success: false, error: message, syncErrors };
    }
  } else {
    return { success: true, message: "No health data to sync.", syncErrors };
  }
};
