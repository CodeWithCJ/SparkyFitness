import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import * as api from './api/healthDataApi';
import { HealthDataPayload } from './api/healthDataApi';
import { HEALTH_METRICS } from '../HealthMetrics';
import { addLog } from './LogService';
import {
  AggregatedHealthRecord,
  SyncResult,
  HealthMetricStates,
  type TransformedRecord,
} from '../types/healthRecords';
import { SyncDuration } from './healthkit/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';
import { runTasksInBatches, TimeoutError, withTimeout } from '../utils/concurrency';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

export const initHealthConnect = HealthKit.initHealthConnect;
export const requestHealthPermissions = HealthKit.requestHealthPermissions;
export const readHealthRecords = HealthKit.readHealthRecords;
export const readHealthRecordsDetailed = async (
  recordType: string,
  startDate: Date,
  endDate: Date,
): Promise<{ records: unknown[]; error?: string }> => ({
  records: await HealthKit.readHealthRecords(recordType, startDate, endDate),
});
export const getSyncStartDate = HealthKit.getSyncStartDate;

// Locked-device detection (HealthKit database inaccessible)
export const resetDatabaseInaccessibleCount = HealthKit.resetDatabaseInaccessibleCount;
export const getDatabaseInaccessibleCount = HealthKit.getDatabaseInaccessibleCount;

export const aggregateByDay = HealthKitAggregation.aggregateByDay;

export const alignToLocalDayStart = (date: Date): Date => {
  const aligned = new Date(date);
  aligned.setHours(0, 0, 0, 0);
  return aligned;
};

// Deduplicated aggregation functions (use HealthKit's statistics API)
export const getAggregatedStepsByDate = HealthKit.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthKit.getAggregatedActiveCaloriesByDate;
export const getAggregatedTotalCaloriesByDate = HealthKit.getAggregatedTotalCaloriesByDate;
export const getAggregatedDistanceByDate = HealthKit.getAggregatedDistanceByDate;
export const getAggregatedFloorsClimbedByDate = HealthKit.getAggregatedFloorsClimbedByDate;

const aggregateDetailed = async (
  fetchRecords: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>,
  startDate: Date,
  endDate: Date,
): Promise<{ records: AggregatedHealthRecord[]; error?: string }> => ({
  records: await fetchRecords(startDate, endDate),
});

export const getAggregatedStepsByDateDetailed = (
  startDate: Date,
  endDate: Date,
) => aggregateDetailed(HealthKit.getAggregatedStepsByDate, startDate, endDate);

export const getAggregatedActiveCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date,
) => aggregateDetailed(HealthKit.getAggregatedActiveCaloriesByDate, startDate, endDate);

export const getAggregatedTotalCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date,
) => aggregateDetailed(HealthKit.getAggregatedTotalCaloriesByDate, startDate, endDate);

export const getAggregatedDistanceByDateDetailed = (
  startDate: Date,
  endDate: Date,
) => aggregateDetailed(HealthKit.getAggregatedDistanceByDate, startDate, endDate);

export const getAggregatedFloorsClimbedByDateDetailed = (
  startDate: Date,
  endDate: Date,
) => aggregateDetailed(HealthKit.getAggregatedFloorsClimbedByDate, startDate, endDate);

export const aggregateSleepSessions = HealthKitAggregation.aggregateSleepSessions;

export const transformHealthRecords = HealthKitTransformation.transformHealthRecords;

export const saveHealthPreference = HealthKitPreferences.saveHealthPreference;
export const loadHealthPreference = HealthKitPreferences.loadHealthPreference;
export const saveStringPreference = HealthKitPreferences.saveStringPreference;
export const loadStringPreference = HealthKitPreferences.loadStringPreference;
export const saveSyncDuration = HealthKitPreferences.saveSyncDuration;
export const loadSyncDuration = HealthKitPreferences.loadSyncDuration;
export const refreshEnabledMetricPermissions = async (
  healthMetricStates: HealthMetricStates,
): Promise<boolean> =>
  migrateEnabledMetricPermissionsIfNeeded({
    healthMetricStates,
    metrics: HEALTH_METRICS,
    loadHealthPreference,
    saveHealthPreference,
    requestHealthPermissions,
    logTag: '[HealthKitService]',
  });

// Background delivery (iOS only)
export {
  enableBackgroundDeliveryForMetric,
  disableBackgroundDeliveryForMetric,
  setupBackgroundDeliveryForEnabledMetrics,
  subscribeToEnabledMetricChanges,
  refreshSubscriptions,
  cleanupAllSubscriptions,
  disableAllBackgroundDelivery,
  startObservers,
  stopObservers,
} from './healthkit/backgroundDelivery';

interface MetricResult {
  data: HealthDataPayload;
  error?: { type: string; error: string };
}

async function processMetric(
  type: string,
  startDate: Date,
  endDate: Date,
): Promise<MetricResult> {
  const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
  if (!metricConfig) {
    addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'WARNING');
    return { data: [] };
  }

  let dataToTransform: unknown[] = [];

  // For cumulative metrics, use aggregation API directly (handles deduplication)
  if (type === 'Steps') {
    dataToTransform = await HealthKit.getAggregatedStepsByDate(startDate, endDate);
  } else if (type === 'ActiveCaloriesBurned') {
    dataToTransform = await HealthKit.getAggregatedActiveCaloriesByDate(startDate, endDate);
  } else if (type === 'Distance') {
    dataToTransform = await HealthKit.getAggregatedDistanceByDate(startDate, endDate);
  } else if (type === 'FloorsClimbed') {
    dataToTransform = await HealthKit.getAggregatedFloorsClimbedByDate(startDate, endDate);
  } else if (type === 'TotalCaloriesBurned') {
    dataToTransform = await HealthKit.getAggregatedTotalCaloriesByDate(startDate, endDate);
  } else {
    // For other types, read raw records
    const rawRecords = await HealthKit.readHealthRecords(type, startDate, endDate);

    if (!rawRecords || rawRecords.length === 0) {
      return { data: [] };
    }

    dataToTransform = rawRecords;

    if (type === 'SleepSession') {
      dataToTransform = HealthKitAggregation.aggregateSleepSessions(
        rawRecords as Parameters<typeof HealthKitAggregation.aggregateSleepSessions>[0]
      );
    }
  }

  const transformed = HealthKitTransformation.transformHealthRecords(dataToTransform, metricConfig);

  if (metricConfig.aggregationStrategy) {
    const aggregated = HealthKitAggregation.aggregateByDay(
      transformed as TransformedRecord[],
      metricConfig.type,
      metricConfig.unit,
      metricConfig.aggregationStrategy,
    );
    return { data: aggregated as HealthDataPayload };
  }

  return { data: transformed as HealthDataPayload };
}

export const syncHealthData = async (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {}
): Promise<SyncResult> => {
  const startDate = HealthKit.getSyncStartDate(syncDuration);
  const endDate = new Date();

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const healthDataTypesToSync = HEALTH_METRICS
    .filter(metric => enabledMetricStates[metric.stateKey])
    .map(metric => metric.recordType);

  const allTransformedData: HealthDataPayload = [];
  const syncErrors: { type: string; error: string }[] = [];

  const results = await runTasksInBatches(
    healthDataTypesToSync,
    METRIC_FETCH_CONCURRENCY,
    type => {
      let metricStartDate = startDate;

      // Slow-changing body measurements require a longer history for calculations (like Adaptive TDEE) and charts
      const historicalMetrics = ['Weight', 'Height', 'BodyFat', 'LeanBodyMass', 'BoneMass'];
      if (historicalMetrics.includes(type)) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        metricStartDate = ninetyDaysAgo;
      }

      return withTimeout(
        processMetric(type, metricStartDate, endDate),
        METRIC_TIMEOUT_MS,
        `HealthKit query for ${type}`,
      );
    },
    {
      stopOnError: error => error instanceof TimeoutError,
    },
  );

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const type = healthDataTypesToSync[index];

    if (result.status === 'skipped') {
      const message = 'Skipped because an earlier metric query timed out.';
      addLog(`[HealthKitService] Skipping ${type}: ${message}`, 'WARNING');
      syncErrors.push({ type, error: message });
      continue;
    }

    if (result.status === 'fulfilled') {
      if (result.value.data.length > 0) {
        allTransformedData.push(...result.value.data);
      }
      if (result.value.error) {
        syncErrors.push(result.value.error);
      }
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      addLog(`[HealthKitService] Error processing ${type}: ${message}`, 'ERROR');
      syncErrors.push({ type, error: message });
    }
  }

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Error sending data to server: ${message}`, 'ERROR');
      return { success: false, error: message, syncErrors };
    }
  } else {
    return { success: true, message: "No new health data to sync.", syncErrors };
  }
};
