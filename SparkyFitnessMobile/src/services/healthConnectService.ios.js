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


export const aggregateStepsByDate = HealthKitAggregation.aggregateStepsByDate;
export const aggregateHeartRateByDate = HealthKitAggregation.aggregateHeartRateByDate;
export const aggregateActiveCaloriesByDate = HealthKitAggregation.aggregateActiveCaloriesByDate;
export const aggregateTotalCaloriesByDate = HealthKitAggregation.aggregateTotalCaloriesByDate;

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
      addLog(`[HealthKitService] Reading ${type} records...`);
      const rawRecords = await HealthKit.readHealthRecords(type, startDate, endDate);

      if (!rawRecords || rawRecords.length === 0) {
        addLog(`[HealthKitService] No ${type} records found`);
        continue;
      }

      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'warn', 'WARNING');
        continue;
      }

      let dataToTransform = rawRecords;

      // Aggregate data where necessary
      if (type === 'Steps') {
        dataToTransform = HealthKitAggregation.aggregateStepsByDate(rawRecords);
      } else if (type === 'HeartRate') {
        dataToTransform = HealthKitAggregation.aggregateHeartRateByDate(rawRecords);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = HealthKitAggregation.aggregateActiveCaloriesByDate(rawRecords);
      } else if (type === 'TotalCaloriesBurned') {
        // Special Handling for iOS: Total Calories = Active + Basal (BMR)
        // HealthKit doesn't have a "Total" type, so we must manually fetch Active calories
        // and combine them with the Basal calories we already fetched (rawRecords for TotalCaloriesBurned maps to Basal).

        try {
          addLog(`[HealthKitService] Fetching Active Calories to add to Total Calories calculation...`);
          const activeRecords = await HealthKit.readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

          if (activeRecords && activeRecords.length > 0) {
            addLog(`[HealthKitService] Found ${activeRecords.length} Active Calories records to merge with ${rawRecords.length} BMR records`);
            // Combine Basal (rawRecords) + Active (activeRecords)
            // The aggregation function simply sums all energy records by date, so this effectively calculates (Basal + Active)
            const combinedRecords = [...rawRecords, ...activeRecords];
            dataToTransform = HealthKitAggregation.aggregateTotalCaloriesByDate(combinedRecords);
          } else {
            addLog(`[HealthKitService] No Active Calories found to merge. Total Calories will only be BMR.`);
            dataToTransform = HealthKitAggregation.aggregateTotalCaloriesByDate(rawRecords);
          }
        } catch (err) {
          addLog(`[HealthKitService] Error fetching extra active calories for total calc: ${err.message}`, 'warn', 'WARNING');
          // Fallback to just BMR if active fails
          dataToTransform = HealthKitAggregation.aggregateTotalCaloriesByDate(rawRecords);
        }
      } else if (type === 'SleepSession') {
        dataToTransform = HealthKitAggregation.aggregateSleepSessions(rawRecords);
        addLog(`[HealthKitService] Aggregated SleepSession records.`);
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

