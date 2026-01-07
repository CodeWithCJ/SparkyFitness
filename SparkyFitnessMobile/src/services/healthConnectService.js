import * as HealthConnect from './healthconnect/index';
import * as HealthConnectAggregation from './healthconnect/dataAggregation';
import * as HealthConnectTransformation from './healthconnect/dataTransformation';
import * as HealthConnectPreferences from './healthconnect/preferences';
import * as api from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import { addLog } from './LogService';
import { Platform } from 'react-native';

export const initHealthConnect = HealthConnect.initHealthConnect;
export const requestHealthPermissions = HealthConnect.requestHealthPermissions;
export const readHealthRecords = HealthConnect.readHealthRecords;
export const getSyncStartDate = HealthConnect.getSyncStartDate;

export const readStepRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('Steps', startDate, endDate);
export const readActiveCaloriesRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('ActiveCaloriesBurned', startDate, endDate);
export const readHeartRateRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('HeartRate', startDate, endDate);
export const readSleepSessionRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('SleepSession', startDate, endDate);
export const readStressRecords = Platform.OS === 'ios'
  ? async (startDate, endDate) => HealthConnect.readHealthRecords('Stress', startDate, endDate)
  : async () => {
    addLog('[HealthConnectService] Stress metric is Android‑only; skipping.', 'info');
    return [];
  };
export const readExerciseSessionRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('ExerciseSession', startDate, endDate);
export const readWorkoutRecords = async (startDate, endDate) => HealthConnect.readHealthRecords('Workout', startDate, endDate);

export const aggregateHeartRateByDate = HealthConnectAggregation.aggregateHeartRateByDate;
export const aggregateStepsByDate = HealthConnectAggregation.aggregateStepsByDate;
export const aggregateTotalCaloriesByDate = HealthConnectAggregation.aggregateTotalCaloriesByDate;
export const aggregateActiveCaloriesByDate = HealthConnectAggregation.aggregateActiveCaloriesByDate;

// Deduplicated aggregation functions (use Health Connect's aggregation API)
export const getAggregatedStepsByDate = HealthConnect.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthConnect.getAggregatedActiveCaloriesByDate;

export const transformHealthRecords = HealthConnectTransformation.transformHealthRecords;

export const saveHealthPreference = HealthConnectPreferences.saveHealthPreference;
export const loadHealthPreference = HealthConnectPreferences.loadHealthPreference;
export const saveStringPreference = HealthConnectPreferences.saveStringPreference;
export const loadStringPreference = HealthConnectPreferences.loadStringPreference;
export const saveSyncDuration = HealthConnectPreferences.saveSyncDuration;
export const loadSyncDuration = HealthConnectPreferences.loadSyncDuration;

export const syncHealthData = async (syncDuration, healthMetricStates = {}) => {
  addLog(`[HealthConnectService] Starting health data sync for duration: ${syncDuration}`);
  const startDate = HealthConnect.getSyncStartDate(syncDuration);

  const endDate = new Date();
  addLog(`[HealthConnectService] Syncing data from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const healthDataTypesToSync = HEALTH_METRICS
    .filter(metric => enabledMetricStates[metric.stateKey])
    .map(metric => metric.recordType);

  addLog(`[HealthConnectService] Will sync ${healthDataTypesToSync.length} metric types: ${healthDataTypesToSync.join(', ')}`);

  let allTransformedData = [];
  const syncErrors = [];

  for (const type of healthDataTypesToSync) {
    try {
      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'warn', 'WARNING');
        continue;
      }

      let dataToTransform = [];

      // For Steps and ActiveCaloriesBurned, use aggregation API directly (handles deduplication)
      if (type === 'Steps') {
        dataToTransform = await HealthConnect.getAggregatedStepsByDate(startDate, endDate);
        addLog(`[HealthConnectService] Got ${dataToTransform.length} deduplicated daily step totals`);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = await HealthConnect.getAggregatedActiveCaloriesByDate(startDate, endDate);
        addLog(`[HealthConnectService] Got ${dataToTransform.length} deduplicated daily calorie totals`);
      } else {
        // For other types, read raw records
        addLog(`[HealthConnectService] Reading ${type} records...`);
        const rawRecords = await HealthConnect.readHealthRecords(type, startDate, endDate);

        if (rawRecords.length === 0) {
          addLog(`[HealthConnectService] No ${type} records found`);
          continue;
        }

        addLog(`[HealthConnectService] Found ${rawRecords.length} raw ${type} records`);
        dataToTransform = rawRecords;

        if (type === 'HeartRate') {
          dataToTransform = HealthConnectAggregation.aggregateHeartRateByDate(rawRecords);
          addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw HeartRate records into ${dataToTransform.length} daily averages`);
        } else if (type === 'TotalCaloriesBurned') {
          dataToTransform = await HealthConnectAggregation.aggregateTotalCaloriesByDate(rawRecords);
          addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw TotalCaloriesBurned records into ${dataToTransform.length} daily totals`);
        } else if (type === 'SleepSession') {
          addLog(`[HealthConnectService] Processing raw SleepSession records.`);
        } else if (type === 'Stress') {
          addLog(`[HealthConnectService] Processing raw Stress records.`);
        } else if (type === 'ExerciseSession') {
          addLog(`[HealthConnectService] Processing raw ExerciseSession records.`);
        }
      }

      const transformed = HealthConnectTransformation.transformHealthRecords(dataToTransform, metricConfig);

      if (transformed.length > 0) {
        addLog(`[HealthConnectService] Successfully transformed ${transformed.length} ${type} records`);
        allTransformedData = allTransformedData.concat(transformed);
      } else {
        addLog(`[HealthConnectService] No ${type} records were transformed (all may have been invalid)`, 'warn', 'WARNING');
      }
    } catch (error) {
      const errorMsg = `Error reading or transforming ${type} records: ${error.message}`;
      addLog(`[HealthConnectService] ${errorMsg}`, 'error', 'ERROR');
      console.error(`[HealthConnectService] ${errorMsg}`, error);
      syncErrors.push({ type, error: error.message });
    }
  }

  addLog(`[HealthConnectService] Total transformed data entries: ${allTransformedData.length}`);

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      addLog(`[HealthConnectService] Server sync response: ${JSON.stringify(apiResponse)}`);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      addLog(`[HealthConnectService] Error sending data to server: ${error.message}`);
      return { success: false, error: error.message, syncErrors };
    }
  } else {
    addLog(`[HealthConnectService] No health data to sync.`);
    return { success: true, message: "No health data to sync.", syncErrors };
  }
};
