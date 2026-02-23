import {
  initialize,
  requestPermission,
  readRecords,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { HEALTH_METRICS } from '../../HealthMetrics';
import {
  aggregateStepsByDate,
  aggregateHeartRateByDate,
  aggregateActiveCaloriesByDate,
  aggregateTotalCaloriesByDate,
  toLocalDateString,
} from './dataAggregation';
import { transformHealthRecords } from './dataTransformation';
import {
  AggregatedHealthRecord,
  PermissionRequest,
  GrantedPermission,
  SyncResult,
  HealthMetricStates,
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
  records: Array<{ metadata?: { dataOrigin?: string }; [key: string]: unknown }>,
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
    console.error('Failed to initialize Health Connect', error);
    return false;
  }
};

export const requestHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<boolean> => {
  try {
    // Cast to library's Permission type - our PermissionRequest interface is compatible
    const grantedPermissions = await requestPermission(
      permissionsToRequest as Parameters<typeof requestPermission>[0]
    ) as GrantedPermission[];

    const allGranted = permissionsToRequest.every(requestedPerm =>
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
    addLog(`[HealthConnectService] Failed to request health permissions: ${message}. Full error: ${JSON.stringify(error)}`);
    console.error('Failed to request health permissions', error);
    throw error;
  }
};

export const readHealthRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> => {
  try {
    const startTime = startDate.toISOString();
    const endTime = endDate.toISOString();
    const result = await readRecords(recordType as Parameters<typeof readRecords>[0], {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime,
        endTime: endTime,
      },
    });
    return result.records || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to read ${recordType} records: ${message}. Full error: ${JSON.stringify(error)}`, 'ERROR');
    console.error(`Failed to read ${recordType} records`, error);
    return [];
  }
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

    const byDate = deduplicateByOrigin(
      rawRecords as Array<{ metadata?: { dataOrigin?: string }; endTime?: string; startTime?: string; count?: number }>,
      (record) => {
        const timestamp = record.endTime || record.startTime;
        return timestamp ? toLocalDateString(timestamp) : '';
      },
      (record) => record.count || 0,
    );

    const results: AggregatedHealthRecord[] = Object.entries(byDate).map(([date, value]) => ({
      date,
      value,
      type: 'step',
    }));

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

    const byDate = deduplicateByOrigin(
      rawRecords as Array<{ metadata?: { dataOrigin?: string }; endTime?: string; startTime?: string; energy?: { inKilocalories?: number } }>,
      (record) => {
        const timestamp = record.endTime || record.startTime;
        return timestamp ? toLocalDateString(timestamp) : '';
      },
      (record) => record.energy?.inKilocalories || 0,
    );

    const results: AggregatedHealthRecord[] = Object.entries(byDate).map(([date, value]) => ({
      date,
      value: Math.round(value),
      type: 'active_calories',
    }));

    addLog(`[HealthConnectService] Active calories aggregation: ${results.length} days`, 'DEBUG');

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error in getAggregatedActiveCaloriesByDate: ${message}`, 'ERROR');
    return [];
  }
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
      } else if (type === 'HeartRate') {
        dataToTransform = aggregateHeartRateByDate(rawRecords as Parameters<typeof aggregateHeartRateByDate>[0]);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = aggregateActiveCaloriesByDate(rawRecords as Parameters<typeof aggregateActiveCaloriesByDate>[0]);
      } else if (type === 'TotalCaloriesBurned') {
        dataToTransform = aggregateTotalCaloriesByDate(rawRecords as Parameters<typeof aggregateTotalCaloriesByDate>[0]);
      }

      const transformed = transformHealthRecords(dataToTransform, metricConfig);

      if (transformed.length > 0) {
        allTransformedData = allTransformedData.concat(transformed);
      } else {
        addLog(`[HealthConnectService] No ${type} records were transformed (all may have been invalid)`, 'WARNING');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `Error reading or transforming ${type} records: ${message}`;
      addLog(`[HealthConnectService] ${errorMsg}`, 'ERROR');
      console.error(`[HealthConnectService] ${errorMsg}`, error);
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
