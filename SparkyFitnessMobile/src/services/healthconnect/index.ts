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
  toLocalDateString,
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
import { toDateStringWithOffset } from '../../utils/dateUtils';

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

/** Derives date from a HC record using per-record zone offset when available. */
const dateFromRecordOffset = (
  timestamp: string,
  startOffset?: HCZoneOffset,
  endOffset?: HCZoneOffset,
  preferEnd = false,
): string => {
  const preferred = preferEnd ? endOffset : startOffset;
  const fallback = preferEnd ? startOffset : endOffset;
  const offset = preferred ?? fallback;
  if (offset?.totalSeconds != null) {
    return toDateStringWithOffset(timestamp, Math.round(offset.totalSeconds / 60));
  }
  return toLocalDateString(timestamp);
};

// Get daily aggregated steps for a date range
// Uses readRecords + JS-side deduplication via metadata.dataOrigin
export const getAggregatedStepsByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  try {
    const rawRecords = await readHealthRecords('Steps', startDate, endDate);

    if (rawRecords.length === 0) {
      addLog(`[HealthConnectService] No step records found for date range`, 'DEBUG');
      return [];
    }

    type StepRecord = { metadata?: { dataOrigin?: string }; endTime?: string; startTime?: string; count?: number; startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset };
    const typedRecords = rawRecords as StepRecord[];

    // Track first-seen offset per date for output metadata
    const offsetByDate: Record<string, number> = {};

    const byDate = deduplicateByOrigin(
      typedRecords,
      (record: StepRecord) => {
        const timestamp = record.endTime || record.startTime;
        if (!timestamp) return '';
        const date = dateFromRecordOffset(timestamp, record.startZoneOffset, record.endZoneOffset, true);
        if (!(date in offsetByDate)) {
          const offset = (record.endZoneOffset ?? record.startZoneOffset);
          if (offset?.totalSeconds != null) {
            offsetByDate[date] = Math.round(offset.totalSeconds / 60);
          }
        }
        return date;
      },
      (record: StepRecord) => record.count || 0,
    );

    const results: AggregatedHealthRecord[] = Object.entries(byDate).map(([date, value]) => {
      const rec: AggregatedHealthRecord = { date, value, type: 'step' };
      if (date in offsetByDate) {
        rec.record_utc_offset_minutes = offsetByDate[date];
      }
      return rec;
    });

    addLog(`[HealthConnectService] Steps aggregation: ${results.length} days`, 'DEBUG');

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error in getAggregatedStepsByDate: ${message}`, 'ERROR');
    return [];
  }
};

// Get daily aggregated active calories for a date range
// Uses readRecords + JS-side deduplication via metadata.dataOrigin
export const getAggregatedActiveCaloriesByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  try {
    const rawRecords = await readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

    if (rawRecords.length === 0) {
      addLog(`[HealthConnectService] No active calorie records found for date range`, 'DEBUG');
      return [];
    }

    type CalorieRecord = { metadata?: { dataOrigin?: string }; endTime?: string; startTime?: string; energy?: { inKilocalories?: number }; startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset };
    const typedRecords = rawRecords as CalorieRecord[];

    const offsetByDate: Record<string, number> = {};

    const byDate = deduplicateByOrigin(
      typedRecords,
      (record: CalorieRecord) => {
        const timestamp = record.endTime || record.startTime;
        if (!timestamp) return '';
        const date = dateFromRecordOffset(timestamp, record.startZoneOffset, record.endZoneOffset, true);
        if (!(date in offsetByDate)) {
          const offset = (record.endZoneOffset ?? record.startZoneOffset);
          if (offset?.totalSeconds != null) {
            offsetByDate[date] = Math.round(offset.totalSeconds / 60);
          }
        }
        return date;
      },
      (record: CalorieRecord) => record.energy?.inKilocalories || 0,
    );

    const results: AggregatedHealthRecord[] = Object.entries(byDate).map(([date, value]) => {
      const rec: AggregatedHealthRecord = { date, value: Math.round(value), type: 'active_calories' };
      if (date in offsetByDate) {
        rec.record_utc_offset_minutes = offsetByDate[date];
      }
      return rec;
    });

    addLog(`[HealthConnectService] Active calories aggregation: ${results.length} days`, 'DEBUG');

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error in getAggregatedActiveCaloriesByDate: ${message}`, 'ERROR');
    return [];
  }
};

/**
 * Enriches raw exercise session records with calories and distance data.
 * Health Connect stores these as separate record types, so we query
 * ActiveCaloriesBurned and Distance aggregated over each session's time range.
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

    const [activeCaloriesResult, distanceResult] = await Promise.allSettled([
      aggregateRecord({
        recordType: 'ActiveCaloriesBurned',
        timeRangeFilter,
        dataOriginFilter,
      }),
      aggregateRecord({
        recordType: 'Distance',
        timeRangeFilter,
        dataOriginFilter,
      }),
    ]);

    // Only attach enriched values when the aggregate call succeeded.
    // If permissions for ActiveCaloriesBurned or Distance aren't granted,
    // the call rejects — leave the record untouched so we don't overwrite
    // potentially valid data with a synthetic zero.
    const enrichedFields: Record<string, unknown> = {};

    // Try ActiveCaloriesBurned first, fall back to TotalCaloriesBurned.
    // Many apps (Fitbit, OHealth, etc.) only write TotalCaloriesBurned to
    // Health Connect, so ActiveCaloriesBurned alone misses those sessions.
    // Treat 0 as missing — the Android Health Connect bridge defaults
    // ACTIVE_CALORIES_TOTAL to 0.0 when no records exist for the range.
    let kcal: number | undefined;
    if (activeCaloriesResult.status === 'fulfilled') {
      const result = activeCaloriesResult.value as { ACTIVE_CALORIES_TOTAL?: { inKilocalories?: number } };
      const active = result.ACTIVE_CALORIES_TOTAL?.inKilocalories;
      if (active != null && active > 0) {
        kcal = active;
      }
    }

    if (kcal == null) {
      try {
        const totalResult = await aggregateRecord({
          recordType: 'TotalCaloriesBurned',
          timeRangeFilter,
          dataOriginFilter,
        }) as { ENERGY_TOTAL?: { inKilocalories?: number } };
        const total = totalResult.ENERGY_TOTAL?.inKilocalories;
        if (total != null && total > 0) {
          kcal = total;
        }
      } catch {
        // Permission not granted or no data — leave untouched
      }
    }

    if (kcal != null) {
      enrichedFields.energy = { inKilocalories: kcal };
    }

    if (distanceResult.status === 'fulfilled') {
      const result = distanceResult.value as { DISTANCE?: { inMeters?: number } };
      const meters = result.DISTANCE?.inMeters;
      if (meters != null) {
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
