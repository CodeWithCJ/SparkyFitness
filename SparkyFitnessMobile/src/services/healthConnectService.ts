import * as HealthConnect from './healthconnect/index';
import * as HealthConnectAggregation from './healthconnect/dataAggregation';
import * as HealthConnectTransformation from './healthconnect/dataTransformation';
import * as HealthConnectPreferences from './healthconnect/preferences';
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
import { SyncDuration } from './healthconnect/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';
import { runTasksInBatches, TimeoutError, withTimeout } from '../utils/concurrency';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

export const initHealthConnect = HealthConnect.initHealthConnect;
export const requestHealthPermissions = HealthConnect.requestHealthPermissions;
export const readHealthRecords = HealthConnect.readHealthRecords;
export const readHealthRecordsDetailed = HealthConnect.readHealthRecordsDetailed;
export const getSyncStartDate = HealthConnect.getSyncStartDate;

export const aggregateByDay = HealthConnectAggregation.aggregateByDay;

// Android does not have a basal-energy aggregation equivalent; display uses RAW_FORMATTERS instead.
export const getAggregatedBasalEnergyByDate = async (_start: Date, _end: Date): Promise<AggregatedHealthRecord[]> => [];

export const getAggregatedStepsByDate = HealthConnect.getAggregatedStepsByDate;
export const getAggregatedStepsByDateDetailed = HealthConnect.getAggregatedStepsByDateDetailed;
export const getAggregatedActiveCaloriesByDate = HealthConnect.getAggregatedActiveCaloriesByDate;
export const getAggregatedActiveCaloriesByDateDetailed = HealthConnect.getAggregatedActiveCaloriesByDateDetailed;

const TOTAL_CALORIES_SPEC: HealthConnect.CumulativeMetricSpec = {
  recordType: 'TotalCaloriesBurned',
  outputType: 'total_calories',
  extractValue: (r) => (r as { ENERGY_TOTAL?: { inKilocalories?: number } }).ENERGY_TOTAL?.inKilocalories ?? 0,
  round: true,
};

const DISTANCE_SPEC: HealthConnect.CumulativeMetricSpec = {
  recordType: 'Distance',
  outputType: 'distance',
  extractValue: (r) => (r as { DISTANCE?: { inMeters?: number } }).DISTANCE?.inMeters ?? 0,
  round: true,
};

const FLOORS_CLIMBED_SPEC: HealthConnect.CumulativeMetricSpec = {
  recordType: 'FloorsClimbed',
  outputType: 'floors_climbed',
  extractValue: (r) => (r as { FLOORS_CLIMBED_TOTAL?: number }).FLOORS_CLIMBED_TOTAL ?? 0,
};

export const alignToLocalDayStart = HealthConnect.alignToLocalDayStart;

export const getAggregatedTotalCaloriesByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnect.HealthConnectAggregateResult> =>
  HealthConnect.aggregateCumulativeMetricByDayDetailed(TOTAL_CALORIES_SPEC, startDate, endDate);

export const getAggregatedTotalCaloriesByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedTotalCaloriesByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedDistanceByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnect.HealthConnectAggregateResult> =>
  HealthConnect.aggregateCumulativeMetricByDayDetailed(DISTANCE_SPEC, startDate, endDate);

export const getAggregatedDistanceByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedDistanceByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedFloorsClimbedByDateDetailed = (
  startDate: Date,
  endDate: Date,
): Promise<HealthConnect.HealthConnectAggregateResult> =>
  HealthConnect.aggregateCumulativeMetricByDayDetailed(FLOORS_CLIMBED_SPEC, startDate, endDate);

export const getAggregatedFloorsClimbedByDate = (
  startDate: Date,
  endDate: Date,
): Promise<AggregatedHealthRecord[]> =>
  getAggregatedFloorsClimbedByDateDetailed(startDate, endDate).then(result => result.records);

// Android handles sleep aggregation in its transformation layer, so this is a passthrough
export const aggregateSleepSessions = (records: unknown[]): unknown[] => records;

export const transformHealthRecords = HealthConnectTransformation.transformHealthRecords;

export const saveHealthPreference = HealthConnectPreferences.saveHealthPreference;
export const loadHealthPreference = HealthConnectPreferences.loadHealthPreference;
export const saveStringPreference = HealthConnectPreferences.saveStringPreference;
export const loadStringPreference = HealthConnectPreferences.loadStringPreference;
export const saveSyncDuration = HealthConnectPreferences.saveSyncDuration;
export const loadSyncDuration = HealthConnectPreferences.loadSyncDuration;
export const refreshEnabledMetricPermissions = async (
  healthMetricStates: HealthMetricStates,
): Promise<boolean> =>
  migrateEnabledMetricPermissionsIfNeeded({
    healthMetricStates,
    metrics: HEALTH_METRICS,
    loadHealthPreference,
    saveHealthPreference,
    requestHealthPermissions,
    logTag: '[HealthConnectService]',
  });

// Locked-device detection stubs for Android (iOS-only feature)
export const resetDatabaseInaccessibleCount = (): void => {};
export const getDatabaseInaccessibleCount = (): number => 0;

// Background delivery stubs for Android (iOS-only feature)
export const enableBackgroundDeliveryForMetric = async (_recordType: string): Promise<void> => {};
export const disableBackgroundDeliveryForMetric = async (_recordType: string): Promise<void> => {};
export const setupBackgroundDeliveryForEnabledMetrics = async (): Promise<void> => {};
export const subscribeToEnabledMetricChanges = (_onDataAvailable: () => void): (() => void) => () => {};
export const refreshSubscriptions = (): void => {};
export const cleanupAllSubscriptions = (): void => {};
export const disableAllBackgroundDelivery = async (): Promise<boolean> => true;
export const startObservers = (_onDataAvailable: () => void): void => {};
export const stopObservers = (): void => {};

interface MetricResult {
  data: HealthDataPayload;
  error?: { type: string; error: string };
}

const metricReadError = (
  type: string,
  error?: string,
): MetricResult['error'] => error ? { type, error } : undefined;

async function processMetric(
  type: string,
  aggregatedStartDate: Date,
  sessionStartDate: Date,
  endDate: Date,
): Promise<MetricResult> {
  const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
  if (!metricConfig) {
    addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'WARNING');
    return { data: [] };
  }

  let dataToTransform: unknown[] = [];
  let error: MetricResult['error'];

  // For cumulative metrics, use deduplicated aggregation functions
  if (type === 'Steps') {
    const result = await HealthConnect.getAggregatedStepsByDateDetailed(aggregatedStartDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'ActiveCaloriesBurned') {
    const result = await HealthConnect.getAggregatedActiveCaloriesByDateDetailed(aggregatedStartDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'TotalCaloriesBurned') {
    const result = await getAggregatedTotalCaloriesByDateDetailed(aggregatedStartDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'Distance') {
    const result = await getAggregatedDistanceByDateDetailed(aggregatedStartDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'FloorsClimbed') {
    const result = await getAggregatedFloorsClimbedByDateDetailed(aggregatedStartDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'ExerciseSession') {
    const readResult = await HealthConnect.readHealthRecordsDetailed(type, sessionStartDate, endDate);
    const rawRecords = readResult.records;
    error = metricReadError(type, readResult.error);
    if (rawRecords.length === 0) {
      return { data: [], error };
    }
    dataToTransform = await HealthConnect.enrichExerciseSessions(rawRecords);
  } else {
    // For other types, read raw records
    const readResult = await HealthConnect.readHealthRecordsDetailed(type, sessionStartDate, endDate);
    const rawRecords = readResult.records;
    error = metricReadError(type, readResult.error);

    if (rawRecords.length === 0) {
      return { data: [], error };
    }

    dataToTransform = rawRecords;
  }

  const transformed = HealthConnectTransformation.transformHealthRecords(dataToTransform, metricConfig);

  if (metricConfig.aggregationStrategy) {
    const aggregated = HealthConnectAggregation.aggregateByDay(
      transformed as TransformedRecord[],
      metricConfig.type,
      metricConfig.unit,
      metricConfig.aggregationStrategy,
    );
    return { data: aggregated as HealthDataPayload, error };
  }

  return { data: transformed as HealthDataPayload, error };
}

export const syncHealthData = async (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {}
): Promise<SyncResult> => {
  const sessionStartDate = HealthConnect.getSyncStartDate(syncDuration);
  const aggregatedStartDate = HealthConnect.alignToLocalDayStart(sessionStartDate);
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
    type => withTimeout(
      processMetric(type, aggregatedStartDate, sessionStartDate, endDate),
      METRIC_TIMEOUT_MS,
      `Health Connect query for ${type}`,
    ),
    {
      stopOnError: error => error instanceof TimeoutError,
    },
  );

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const type = healthDataTypesToSync[index];

    if (result.status === 'skipped') {
      const message = 'Skipped because an earlier metric query timed out.';
      addLog(`[HealthConnectService] Skipping ${type}: ${message}`, 'WARNING');
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
      addLog(`[HealthConnectService] Error processing ${type}: ${message}`, 'ERROR');
      syncErrors.push({ type, error: message });
    }
  }

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthConnectService] Error sending data to server: ${message}`, 'ERROR');
      return { success: false, error: message, syncErrors };
    }
  } else {
    return { success: true, message: "No health data to sync.", syncErrors };
  }
};
