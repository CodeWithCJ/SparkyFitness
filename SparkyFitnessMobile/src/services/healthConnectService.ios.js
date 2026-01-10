import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import * as api from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import { addLog } from './LogService';

export const initHealthConnect = HealthKit.initHealthConnect;
export const requestHealthPermissions = HealthKit.requestHealthPermissions;
export const readHealthRecords = HealthKit.readHealthRecords;
export const getSyncStartDate = HealthKit.getSyncStartDate;


export const aggregateHeartRateByDate = HealthKitAggregation.aggregateHeartRateByDate;

// Deduplicated aggregation functions (use HealthKit's statistics API)
export const getAggregatedStepsByDate = HealthKit.getAggregatedStepsByDate;
export const getAggregatedActiveCaloriesByDate = HealthKit.getAggregatedActiveCaloriesByDate;
export const getAggregatedTotalCaloriesByDate = HealthKit.getAggregatedTotalCaloriesByDate;
export const getAggregatedDistanceByDate = HealthKit.getAggregatedDistanceByDate;
export const getAggregatedFloorsClimbedByDate = HealthKit.getAggregatedFloorsClimbedByDate;

export const transformHealthRecords = HealthKitTransformation.transformHealthRecords;

export const saveHealthPreference = HealthKitPreferences.saveHealthPreference;
export const loadHealthPreference = HealthKitPreferences.loadHealthPreference;
export const saveStringPreference = HealthKitPreferences.saveStringPreference;
export const loadStringPreference = HealthKitPreferences.loadStringPreference;
export const saveSyncDuration = HealthKitPreferences.saveSyncDuration;
export const loadSyncDuration = HealthKitPreferences.loadSyncDuration;

export const syncHealthData = async (syncDuration, healthMetricStates = {}) => {
  addLog(`[HealthKitService] Starting health data sync for duration: ${syncDuration}`);
  const startDate = HealthKit.getSyncStartDate(syncDuration);
  const endDate = new Date();

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const healthDataTypesToSync = HEALTH_METRICS
    .filter(metric => enabledMetricStates[metric.stateKey])
    .map(metric => metric.recordType);

  addLog(`[HealthKitService] Will sync ${healthDataTypesToSync.length} metric types: ${healthDataTypesToSync.join(', ')}`);

  let allTransformedData = [];
  const syncErrors = [];

  for (const type of healthDataTypesToSync) {
    try {
      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'warn', 'WARNING');
        continue;
      }

      let dataToTransform = [];

      // For cumulative metrics, use aggregation API directly (handles deduplication)
      if (type === 'Steps') {
        dataToTransform = await HealthKit.getAggregatedStepsByDate(startDate, endDate);
        addLog(`[HealthKitService] Got ${dataToTransform.length} deduplicated daily step totals`);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = await HealthKit.getAggregatedActiveCaloriesByDate(startDate, endDate);
        addLog(`[HealthKitService] Got ${dataToTransform.length} deduplicated daily calorie totals`);
      } else if (type === 'Distance') {
        dataToTransform = await HealthKit.getAggregatedDistanceByDate(startDate, endDate);
        addLog(`[HealthKitService] Got ${dataToTransform.length} deduplicated daily distance totals`);
      } else if (type === 'FloorsClimbed') {
        dataToTransform = await HealthKit.getAggregatedFloorsClimbedByDate(startDate, endDate);
        addLog(`[HealthKitService] Got ${dataToTransform.length} deduplicated daily floors totals`);
      } else {
        // For other types, read raw records
        addLog(`[HealthKitService] Reading ${type} records...`);
        const rawRecords = await HealthKit.readHealthRecords(type, startDate, endDate);

        if (!rawRecords || rawRecords.length === 0) {
          addLog(`[HealthKitService] No ${type} records found`);
          continue;
        }

        dataToTransform = rawRecords;

        if (type === 'HeartRate') {
          dataToTransform = HealthKitAggregation.aggregateHeartRateByDate(rawRecords);
        } else if (type === 'TotalCaloriesBurned') {
          // Use deduplicated statistics query (matches Health app behavior)
          dataToTransform = await HealthKit.getAggregatedTotalCaloriesByDate(startDate, endDate);
          addLog(`[HealthKitService] Got ${dataToTransform.length} deduplicated daily total calorie entries`);
        } else if (type === 'SleepSession') {
          dataToTransform = HealthKitAggregation.aggregateSleepSessions(rawRecords);
          addLog(`[HealthKitService] Aggregated SleepSession records.`);
        }
      }

      const transformed = HealthKitTransformation.transformHealthRecords(dataToTransform, metricConfig);

      if (transformed.length > 0) {
        addLog(`[HealthKitService] Successfully transformed ${transformed.length} ${type} records`);
        allTransformedData = allTransformedData.concat(transformed);
      }
    } catch (error) {
      const errorMsg = `Error reading or transforming ${type} records: ${error.message}`;
      addLog(`[HealthKitService] ${errorMsg}`, 'error', 'ERROR');
      syncErrors.push({ type, error: error.message });
    }
  }

  addLog(`[HealthKitService] Total transformed data entries to sync: ${allTransformedData.length}`);

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      addLog(`[HealthKitService] Server sync finished successfully.`);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      addLog(`[HealthKitService] Error sending data to server: ${error.message}`, 'error', 'ERROR');
      return { success: false, error: error.message, syncErrors };
    }
  } else {
    addLog(`[HealthKitService] No new health data to sync.`);
    return { success: true, message: "No new health data to sync.", syncErrors };
  }
};

