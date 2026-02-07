import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import * as api from './api';
import { HealthDataPayload } from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import { addLog } from './LogService';
import {
  SyncResult,
  HealthMetricStates,
} from '../types/healthRecords';
import { SyncDuration } from './healthkit/preferences';

export const initHealthConnect = HealthKit.initHealthConnect;
export const requestHealthPermissions = HealthKit.requestHealthPermissions;
export const readHealthRecords = HealthKit.readHealthRecords;
export const getSyncStartDate = HealthKit.getSyncStartDate;

// Record reader functions for specific types
export const readStepRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('Steps', startDate, endDate);

export const readActiveCaloriesRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

export const readHeartRateRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('HeartRate', startDate, endDate);

export const readSleepSessionRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('SleepSession', startDate, endDate);

export const readStressRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('Stress', startDate, endDate);

export const readExerciseSessionRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('ExerciseSession', startDate, endDate);

export const readWorkoutRecords = async (startDate: Date, endDate: Date): Promise<unknown[]> =>
  HealthKit.readHealthRecords('Workout', startDate, endDate);

export const aggregateHeartRateByDate = HealthKitAggregation.aggregateHeartRateByDate;

// Deduplicated aggregation functions (use HealthKit's statistics API)
export const getAggregatedStepsByDate = HealthKit.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthKit.getAggregatedActiveCaloriesByDate;
export const getAggregatedTotalCaloriesByDate = HealthKit.getAggregatedTotalCaloriesByDate;
export const getAggregatedDistanceByDate = HealthKit.getAggregatedDistanceByDate;
export const getAggregatedFloorsClimbedByDate = HealthKit.getAggregatedFloorsClimbedByDate;

export const aggregateSleepSessions = HealthKitAggregation.aggregateSleepSessions;

export const transformHealthRecords = HealthKitTransformation.transformHealthRecords;

export const saveHealthPreference = HealthKitPreferences.saveHealthPreference;
export const loadHealthPreference = HealthKitPreferences.loadHealthPreference;
export const saveStringPreference = HealthKitPreferences.saveStringPreference;
export const loadStringPreference = HealthKitPreferences.loadStringPreference;
export const saveSyncDuration = HealthKitPreferences.saveSyncDuration;
export const loadSyncDuration = HealthKitPreferences.loadSyncDuration;

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

  for (const type of healthDataTypesToSync) {
    try {
      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'WARNING');
        continue;
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
      } else {
        // For other types, read raw records
        const rawRecords = await HealthKit.readHealthRecords(type, startDate, endDate);

        if (!rawRecords || rawRecords.length === 0) {
          continue;
        }

        dataToTransform = rawRecords;

        if (type === 'HeartRate') {
          dataToTransform = HealthKitAggregation.aggregateHeartRateByDate(
            rawRecords as Parameters<typeof HealthKitAggregation.aggregateHeartRateByDate>[0]
          );
        } else if (type === 'TotalCaloriesBurned') {
          // Use deduplicated statistics query (matches Health app behavior)
          dataToTransform = await HealthKit.getAggregatedTotalCaloriesByDate(startDate, endDate);
        } else if (type === 'SleepSession') {
          dataToTransform = HealthKitAggregation.aggregateSleepSessions(
            rawRecords as Parameters<typeof HealthKitAggregation.aggregateSleepSessions>[0]
          );
        }
      }

      const transformed = HealthKitTransformation.transformHealthRecords(dataToTransform, metricConfig);

      if (transformed.length > 0) {
        allTransformedData.push(...(transformed as HealthDataPayload));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Error reading or transforming ${type} records: ${message}`, 'ERROR');
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
