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
  type HCZoneOffset,
} from '../types/healthRecords';
import { toDateStringWithOffset } from '../utils/dateUtils';
import { SyncDuration } from './healthconnect/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';
import { runTasksInBatches, TimeoutError, withTimeout } from '../utils/concurrency';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

export const initHealthConnect = HealthConnect.initHealthConnect;
export const requestHealthPermissions = HealthConnect.requestHealthPermissions;
export const readHealthRecords = HealthConnect.readHealthRecords;
export const getSyncStartDate = HealthConnect.getSyncStartDate;

export const readStepRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('Steps', startDate, endDate);

export const readActiveCaloriesRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

export const readHeartRateRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('HeartRate', startDate, endDate);

export const readSleepSessionRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('SleepSession', startDate, endDate);

// Stress metric is iOS-only (maps to MindfulSession in HealthKit)
// Android Health Connect doesn't have a Stress record type
export const readStressRecords = async (
  _startDate: Date,
  _endDate: Date
): Promise<unknown[]> => {
  return [];
};

export const readExerciseSessionRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('ExerciseSession', startDate, endDate);

export const readWorkoutRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthConnect.readHealthRecords('Workout', startDate, endDate);

export const aggregateHeartRateByDate = HealthConnectAggregation.aggregateHeartRateByDate;
export const aggregateByDay = HealthConnectAggregation.aggregateByDay;
export const aggregateStepsByDate = HealthConnectAggregation.aggregateStepsByDate;
export const aggregateTotalCaloriesByDate = HealthConnectAggregation.aggregateTotalCaloriesByDate;
export const aggregateActiveCaloriesByDate = HealthConnectAggregation.aggregateActiveCaloriesByDate;

// Deduplicated aggregation functions (JS-side dedup via metadata.dataOrigin)
export const getAggregatedStepsByDate = HealthConnect.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthConnect.getAggregatedActiveCaloriesByDate;

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
  return HealthConnectAggregation.toLocalDateString(timestamp);
};

// Android implementations for additional aggregation functions
// These aggregate raw records by date with deduplication across data sources
export const getAggregatedTotalCaloriesByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  type CalRecord = {
    startTime?: string; endTime?: string; time?: string;
    energy?: { inKilocalories?: number };
    metadata?: { dataOrigin?: string };
    startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset;
  };
  const records = await HealthConnect.readHealthRecords('TotalCaloriesBurned', startDate, endDate) as CalRecord[];

  const offsetByDate: Record<string, number> = {};

  const byDate = HealthConnect.deduplicateByOrigin(
    records,
    (record: CalRecord) => {
      const timestamp = record.endTime || record.startTime || record.time || '';
      if (!timestamp) return '';
      const date = dateFromRecordOffset(timestamp, record.startZoneOffset, record.endZoneOffset, true);
      if (!(date in offsetByDate)) {
        const offset = record.endZoneOffset ?? record.startZoneOffset;
        if (offset?.totalSeconds != null) {
          offsetByDate[date] = Math.round(offset.totalSeconds / 60);
        }
      }
      return date;
    },
    (record: CalRecord) => record.energy?.inKilocalories || 0,
  );

  return Object.entries(byDate).map(([date, value]) => {
    const rec: AggregatedHealthRecord = { date, value: Math.round(value), type: 'total_calories' };
    if (date in offsetByDate) {
      rec.record_utc_offset_minutes = offsetByDate[date];
    }
    return rec;
  });
};

export const getAggregatedDistanceByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  type DistRecord = {
    startTime?: string; endTime?: string; time?: string;
    distance?: { inMeters?: number };
    metadata?: { dataOrigin?: string };
    startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset;
  };
  const records = await HealthConnect.readHealthRecords('Distance', startDate, endDate) as DistRecord[];

  const offsetByDate: Record<string, number> = {};

  const byDate = HealthConnect.deduplicateByOrigin(
    records,
    (record: DistRecord) => {
      const timestamp = record.endTime || record.startTime || record.time || '';
      if (!timestamp) return '';
      const date = dateFromRecordOffset(timestamp, record.startZoneOffset, record.endZoneOffset, true);
      if (!(date in offsetByDate)) {
        const offset = record.endZoneOffset ?? record.startZoneOffset;
        if (offset?.totalSeconds != null) {
          offsetByDate[date] = Math.round(offset.totalSeconds / 60);
        }
      }
      return date;
    },
    (record: DistRecord) => record.distance?.inMeters || 0,
  );

  return Object.entries(byDate).map(([date, value]) => {
    const rec: AggregatedHealthRecord = { date, value: Math.round(value), type: 'distance' };
    if (date in offsetByDate) {
      rec.record_utc_offset_minutes = offsetByDate[date];
    }
    return rec;
  });
};

export const getAggregatedFloorsClimbedByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  type FloorRecord = {
    startTime?: string; endTime?: string; time?: string;
    floors?: number;
    metadata?: { dataOrigin?: string };
    startZoneOffset?: HCZoneOffset; endZoneOffset?: HCZoneOffset;
  };
  const records = await HealthConnect.readHealthRecords('FloorsClimbed', startDate, endDate) as FloorRecord[];

  const offsetByDate: Record<string, number> = {};

  const byDate = HealthConnect.deduplicateByOrigin(
    records,
    (record: FloorRecord) => {
      const timestamp = record.endTime || record.startTime || record.time || '';
      if (!timestamp) return '';
      const date = dateFromRecordOffset(timestamp, record.startZoneOffset, record.endZoneOffset, true);
      if (!(date in offsetByDate)) {
        const offset = record.endZoneOffset ?? record.startZoneOffset;
        if (offset?.totalSeconds != null) {
          offsetByDate[date] = Math.round(offset.totalSeconds / 60);
        }
      }
      return date;
    },
    (record: FloorRecord) => record.floors || 0,
  );

  return Object.entries(byDate).map(([date, value]) => {
    const rec: AggregatedHealthRecord = { date, value: Math.round(value), type: 'floors_climbed' };
    if (date in offsetByDate) {
      rec.record_utc_offset_minutes = offsetByDate[date];
    }
    return rec;
  });
};

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

async function processMetric(
  type: string,
  startDate: Date,
  endDate: Date,
): Promise<MetricResult> {
  const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
  if (!metricConfig) {
    addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'WARNING');
    return { data: [] };
  }

  let dataToTransform: unknown[] = [];

  // For cumulative metrics, use deduplicated aggregation functions
  if (type === 'Steps') {
    dataToTransform = await HealthConnect.getAggregatedStepsByDate(startDate, endDate);
  } else if (type === 'ActiveCaloriesBurned') {
    dataToTransform = await HealthConnect.getAggregatedActiveCaloriesByDate(startDate, endDate);
  } else if (type === 'TotalCaloriesBurned') {
    dataToTransform = await getAggregatedTotalCaloriesByDate(startDate, endDate);
  } else if (type === 'Distance') {
    dataToTransform = await getAggregatedDistanceByDate(startDate, endDate);
  } else if (type === 'FloorsClimbed') {
    dataToTransform = await getAggregatedFloorsClimbedByDate(startDate, endDate);
  } else if (type === 'ExerciseSession') {
    const rawRecords = await HealthConnect.readHealthRecords(type, startDate, endDate);
    if (rawRecords.length === 0) {
      return { data: [] };
    }
    dataToTransform = await HealthConnect.enrichExerciseSessions(rawRecords);
  } else {
    // For other types, read raw records
    const rawRecords = await HealthConnect.readHealthRecords(type, startDate, endDate);

    if (rawRecords.length === 0) {
      return { data: [] };
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
    return { data: aggregated as HealthDataPayload };
  }

  return { data: transformed as HealthDataPayload };
}

export const syncHealthData = async (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {}
): Promise<SyncResult> => {
  const startDate = HealthConnect.getSyncStartDate(syncDuration);
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
      processMetric(type, startDate, endDate),
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
