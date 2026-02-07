import * as HealthConnect from './healthconnect/index';
import * as HealthConnectAggregation from './healthconnect/dataAggregation';
import * as HealthConnectTransformation from './healthconnect/dataTransformation';
import * as HealthConnectPreferences from './healthconnect/preferences';
import * as api from './api';
import { HealthDataPayload } from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import { addLog } from './LogService';
import {
  AggregatedHealthRecord,
  SyncResult,
  HealthMetricStates,
} from '../types/healthRecords';
import { SyncDuration } from './healthconnect/preferences';

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
export const aggregateStepsByDate = HealthConnectAggregation.aggregateStepsByDate;
export const aggregateTotalCaloriesByDate = HealthConnectAggregation.aggregateTotalCaloriesByDate;
export const aggregateActiveCaloriesByDate = HealthConnectAggregation.aggregateActiveCaloriesByDate;

// Deduplicated aggregation functions (use Health Connect's aggregation API)
export const getAggregatedStepsByDate = HealthConnect.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthConnect.getAggregatedActiveCaloriesByDate;

// Android implementations for additional aggregation functions
// These aggregate raw records by date since Android Health Connect doesn't have the same statistics API as HealthKit
export const getAggregatedTotalCaloriesByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  const records = await HealthConnect.readHealthRecords('TotalCaloriesBurned', startDate, endDate) as {
    startTime?: string;
    time?: string;
    energy?: { inKilocalories?: number };
  }[];
  const byDate: Record<string, number> = {};
  records.forEach(record => {
    const timestamp = record.startTime || record.time || '';
    if (!timestamp) return;
    const date = HealthConnectAggregation.toLocalDateString(timestamp);
    byDate[date] = (byDate[date] || 0) + (record.energy?.inKilocalories || 0);
  });
  return Object.entries(byDate).map(([date, value]) => ({ date, value: Math.round(value), type: 'total_calories' }));
};

export const getAggregatedDistanceByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  const records = await HealthConnect.readHealthRecords('Distance', startDate, endDate) as {
    startTime?: string;
    time?: string;
    distance?: { inMeters?: number };
  }[];
  const byDate: Record<string, number> = {};
  records.forEach(record => {
    const timestamp = record.startTime || record.time || '';
    if (!timestamp) return;
    const date = HealthConnectAggregation.toLocalDateString(timestamp);
    byDate[date] = (byDate[date] || 0) + (record.distance?.inMeters || 0);
  });
  return Object.entries(byDate).map(([date, value]) => ({ date, value: Math.round(value), type: 'distance' }));
};

export const getAggregatedFloorsClimbedByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  const records = await HealthConnect.readHealthRecords('FloorsClimbed', startDate, endDate) as {
    startTime?: string;
    time?: string;
    floors?: number;
  }[];
  const byDate: Record<string, number> = {};
  records.forEach(record => {
    const timestamp = record.startTime || record.time || '';
    if (!timestamp) return;
    const date = HealthConnectAggregation.toLocalDateString(timestamp);
    byDate[date] = (byDate[date] || 0) + (record.floors || 0);
  });
  return Object.entries(byDate).map(([date, value]) => ({ date, value: Math.round(value), type: 'floors_climbed' }));
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

  for (const type of healthDataTypesToSync) {
    try {
      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'WARNING');
        continue;
      }

      let dataToTransform: unknown[] = [];

      // For Steps and ActiveCaloriesBurned, use aggregation API directly (handles deduplication)
      if (type === 'Steps') {
        dataToTransform = await HealthConnect.getAggregatedStepsByDate(startDate, endDate);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = await HealthConnect.getAggregatedActiveCaloriesByDate(startDate, endDate);
      } else {
        // For other types, read raw records
        const rawRecords = await HealthConnect.readHealthRecords(type, startDate, endDate);

        if (rawRecords.length === 0) {
          continue;
        }

        dataToTransform = rawRecords;

        if (type === 'HeartRate') {
          dataToTransform = HealthConnectAggregation.aggregateHeartRateByDate(
            rawRecords as Parameters<typeof HealthConnectAggregation.aggregateHeartRateByDate>[0]
          );
        } else if (type === 'TotalCaloriesBurned') {
          dataToTransform = HealthConnectAggregation.aggregateTotalCaloriesByDate(
            rawRecords as Parameters<typeof HealthConnectAggregation.aggregateTotalCaloriesByDate>[0]
          );
        }
      }

      const transformed = HealthConnectTransformation.transformHealthRecords(dataToTransform, metricConfig);

      if (transformed.length > 0) {
        allTransformedData.push(...(transformed as HealthDataPayload));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthConnectService] Error reading or transforming ${type} records: ${message}`, 'ERROR');
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
