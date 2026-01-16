import {
  initialize,
  requestPermission,
  readRecords,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { HEALTH_METRICS } from '../../constants/HealthMetrics';
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
import { SyncDuration } from './preferences';

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
    addLog(`[HealthConnectService] Failed to read ${recordType} records: ${message}. Full error: ${JSON.stringify(error)}`, 'error', 'ERROR');
    console.error(`Failed to read ${recordType} records`, error);
    return [];
  }
};

// Get daily aggregated steps for a date range
// Note: Uses readRecords + manual aggregation since aggregateRecord API has issues
export const getAggregatedStepsByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  try {
    const rawRecords = await readRecords('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
    });

    const records = rawRecords.records || [];

    if (records.length === 0) {
      addLog(`[HealthConnectService] No step records found for date range`, 'debug');
      return [];
    }

    addLog(`[HealthConnectService] Processing ${records.length} step records`, 'debug');

    // Aggregate by date
    let processedCount = 0;
    let errorCount = 0;
    const aggregatedData = records.reduce<Record<string, number>>((acc, record) => {
      try {
        const timeToUse = record.endTime || record.startTime;
        const date = toLocalDateString(timeToUse);
        const steps = record.count || 0;

        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += steps;
        processedCount++;
      } catch (error) {
        errorCount++;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[HealthConnectService] Error processing step record: ${message}`);
      }
      return acc;
    }, {});

    const results: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
      date,
      value: aggregatedData[date],
      type: 'step',
    }));

    addLog(`[HealthConnectService] Steps aggregation: ${processedCount} records processed, ${results.length} days, ${errorCount} errors`, 'debug');

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error in getAggregatedStepsByDate: ${message}`, 'error', 'ERROR');
    return [];
  }
};

// Get daily aggregated active calories for a date range
// Note: Uses readRecords + manual aggregation since aggregateRecord API has issues
export const getAggregatedActiveCaloriesByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  try {
    const rawRecords = await readRecords('ActiveCaloriesBurned', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
    });

    const records = rawRecords.records || [];

    if (records.length === 0) {
      addLog(`[HealthConnectService] No active calorie records found for date range`, 'debug');
      return [];
    }

    addLog(`[HealthConnectService] Processing ${records.length} active calorie records`, 'debug');

    // Aggregate by date
    let processedCount = 0;
    let errorCount = 0;
    const aggregatedData = records.reduce<Record<string, number>>((acc, record) => {
      try {
        const timeToUse = record.endTime || record.startTime;
        const date = toLocalDateString(timeToUse);
        const calories = record.energy?.inKilocalories || 0;

        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += calories;
        processedCount++;
      } catch (error) {
        errorCount++;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[HealthConnectService] Error processing calorie record: ${message}`);
      }
      return acc;
    }, {});

    const results: AggregatedHealthRecord[] = Object.keys(aggregatedData).map(date => ({
      date,
      value: Math.round(aggregatedData[date]),
      type: 'active_calories',
    }));

    addLog(`[HealthConnectService] Active calories aggregation: ${processedCount} records processed, ${results.length} days, ${errorCount} errors`, 'debug');

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Error in getAggregatedActiveCaloriesByDate: ${message}`, 'error', 'ERROR');
    return [];
  }
};

export const getSyncStartDate = (duration: SyncDuration): Date => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case 'today':
      // Already set to midnight
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 2);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 6);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 29);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 89);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
  return startDate;
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
        addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'warn', 'WARNING');
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
        addLog(`[HealthConnectService] No ${type} records were transformed (all may have been invalid)`, 'warn', 'WARNING');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `Error reading or transforming ${type} records: ${message}`;
      addLog(`[HealthConnectService] ${errorMsg}`, 'error', 'ERROR');
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
