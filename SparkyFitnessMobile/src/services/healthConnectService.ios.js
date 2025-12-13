import {
  requestAuthorization,
  queryQuantitySamples,
  isHealthDataAvailable,
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import { Platform, Alert } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import * as api from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';

const SYNC_DURATION_KEY = '@HealthKit:syncDuration';

// Track if HealthKit is available on this device
let isHealthKitAvailable = false;

// Define all supported HealthKit type identifiers for this app
const SUPPORTED_HK_TYPES = new Set([
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKQuantityTypeIdentifierBloodGlucose',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierFlightsClimbed',
  'HKQuantityTypeIdentifierDietaryWater',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
]);

// Map our internal health metric types to the official HealthKit identifiers
const HEALTHKIT_TYPE_MAP = {
  'Steps': 'HKQuantityTypeIdentifierStepCount',
  'HeartRate': 'HKQuantityTypeIdentifierHeartRate',
  'ActiveCaloriesBurned': 'HKQuantityTypeIdentifierActiveEnergyBurned',
  'TotalCaloriesBurned': 'HKQuantityTypeIdentifierBasalEnergyBurned',
  'Weight': 'HKQuantityTypeIdentifierBodyMass',
  'Height': 'HKQuantityTypeIdentifierHeight',
  'BodyFat': 'HKQuantityTypeIdentifierBodyFatPercentage',
  'BloodPressure': 'BloodPressure', // Special case, handled separately
  'BloodPressureSystolic': 'HKQuantityTypeIdentifierBloodPressureSystolic',
  'BloodPressureDiastolic': 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'BodyTemperature': 'HKQuantityTypeIdentifierBodyTemperature',
  'BloodGlucose': 'HKQuantityTypeIdentifierBloodGlucose',
  'OxygenSaturation': 'HKQuantityTypeIdentifierOxygenSaturation',
  'Vo2Max': 'HKQuantityTypeIdentifierVO2Max',
  'RestingHeartRate': 'HKQuantityTypeIdentifierRestingHeartRate',
  'RespiratoryRate': 'HKQuantityTypeIdentifierRespiratoryRate',
  'Distance': 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'FloorsClimbed': 'HKQuantityTypeIdentifierFlightsClimbed',
  'Hydration': 'HKQuantityTypeIdentifierDietaryWater',
  'LeanBodyMass': 'HKQuantityTypeIdentifierLeanBodyMass',
  'SleepSession': 'HKCategoryTypeIdentifierSleepAnalysis',
};


// Alias for cross-platform compatibility - Android uses initHealthConnect
export const initHealthConnect = async () => {
  try {
    isHealthKitAvailable = await isHealthDataAvailable();
    if (!isHealthKitAvailable) {
      addLog('[HealthKitService] HealthKit is not available on this device.', 'warn', 'WARNING');
    }
    return isHealthKitAvailable;
  } catch (error) {
    addLog(`[HealthKitService] Failed to check HealthKit availability: ${error.message}`, 'error', 'ERROR');
    isHealthKitAvailable = false;
    return false;
  }
};

export const requestHealthPermissions = async (permissionsToRequest) => {
  if (!isHealthKitAvailable) {
    addLog('[HealthKitService] Cannot request permissions; HealthKit not available.', 'warn', 'WARNING');
    Alert.alert(
      'Health App Not Available',
      'Please install the Apple Health app to sync your health data.'
    );
    return false;
  }

  const isSimulator = Platform.OS === 'ios' && Platform.constants?.simulator === true;
  if (isSimulator && !global?.FORCE_HEALTHKIT_ON_SIM) {
    console.warn('[HealthKitService] Simulator detected - HealthKit authorization skipped.');
    return true;
  }

  if (!permissionsToRequest || permissionsToRequest.length === 0) {
    addLog('[HealthKitService] No permissions requested.', 'info', 'INFO');
    return true;
  }

  const readPermissionsSet = new Set();
  const writePermissionsSet = new Set();

  permissionsToRequest.forEach(p => {
    const healthkitIdentifier = HEALTHKIT_TYPE_MAP[p.recordType];
    if (healthkitIdentifier) {
      // Special handling for BloodPressure, which involves two identifiers
      if (p.recordType === 'BloodPressure') {
        if (p.accessType === 'read') {
          readPermissionsSet.add('HKQuantityTypeIdentifierBloodPressureSystolic');
          readPermissionsSet.add('HKQuantityTypeIdentifierBloodPressureDiastolic');
        } else if (p.accessType === 'write') {
          writePermissionsSet.add('HKQuantityTypeIdentifierBloodPressureSystolic');
          writePermissionsSet.add('HKQuantityTypeIdentifierBloodPressureDiastolic');
        }
      } else if (SUPPORTED_HK_TYPES.has(healthkitIdentifier)) {
        if (p.accessType === 'read') {
          readPermissionsSet.add(healthkitIdentifier);
        } else if (p.accessType === 'write') {
          writePermissionsSet.add(healthkitIdentifier);
        }
      } else {
        addLog(`[HealthKitService] Permission requested for unsupported type: ${p.recordType} (${healthkitIdentifier}). Skipping.`, 'warn', 'WARNING');
      }
    } else {
      addLog(`[HealthKitService] No HealthKit identifier found for record type: ${p.recordType}. Skipping.`, 'warn', 'WARNING');
    }
  });

  const toRead = Array.from(readPermissionsSet);
  const toShare = Array.from(writePermissionsSet);

  if (toRead.length === 0 && toShare.length === 0) {
    addLog(`[HealthKitService] No valid and supported HealthKit permissions to request.`, 'warn', 'WARNING');
    return true;
  }

  try {
    addLog(`[HealthKitService] Requesting authorization - Read: [${toRead.join(', ')}], Write: [${toShare.join(', ')}]`, 'info', 'INFO');

    const result = await requestAuthorization({ toRead, toWrite: toShare });

    if (result) {
      addLog(`[HealthKitService] Authorization request completed successfully.`, 'info', 'SUCCESS');
    } else {
      addLog(`[HealthKitService] Authorization may not have been granted for all requested permissions.`, 'warn', 'WARNING');
    }

    return true;

  } catch (error) {
    addLog(`[HealthKitService] Failed to request permissions: ${error.message}`, 'error', 'ERROR');
    console.error('[HealthKitService] Permission request error', error);
    Alert.alert(
      'Permission Error',
      `An unexpected error occurred while trying to request Health permissions: ${error.message}`
    );
    return false;
  }
};

export const getSyncStartDate = (duration) => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case '24h':
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  return startDate;
};

// Read health records from HealthKit
export const readHealthRecords = async (recordType, startDate, endDate) => {
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available, returning empty records for ${recordType}`, 'warn', 'WARNING');
    return [];
  }

  try {
    addLog(`[HealthKitService] Reading ${recordType} records from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    if (!identifier) {
      addLog(`[HealthKitService] Unsupported record type: ${recordType}`, 'warn', 'WARNING');
      return [];
    }

    // Handle special cases first
    if (recordType === 'SleepSession') {
      const samples = await queryCategorySamples(identifier, { from: startDate, to: endDate });
      addLog(`[HealthKitService] Read ${samples.length} Sleep records`);
      return samples.map(s => ({
        startTime: s.startDate,
        endTime: s.endDate,
      }));
    }

    if (recordType === 'BloodPressure') {
      const systolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', { from: startDate, to: endDate });
      const diastolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', { from: startDate, to: endDate });

      const bpMap = new Map();
      systolicSamples.forEach(s => bpMap.set(s.startDate, { systolic: s.quantity, time: s.startDate }));
      diastolicSamples.forEach(s => {
        const existing = bpMap.get(s.startDate);
        if (existing) existing.diastolic = s.quantity;
      });

      const results = Array.from(bpMap.values())
        .filter(r => r.systolic && r.diastolic) // Ensure both values exist
        .map(r => ({
          systolic: { inMillimetersOfMercury: r.systolic },
          diastolic: { inMillimetersOfMercury: r.diastolic },
          time: r.time,
        }));

      addLog(`[HealthKitService] Read and combined ${results.length} BloodPressure records`);
      return results;
    }

    // Handle all other standard quantity types
    if (!SUPPORTED_HK_TYPES.has(identifier)) {
      addLog(`[HealthKitService] Unsupported quantity record type: ${recordType}`, 'warn', 'WARNING');
      return [];
    }

    const samples = await queryQuantitySamples(identifier, { from: startDate, to: endDate });
    addLog(`[HealthKitService] Read ${samples.length} ${recordType} records, applying manual filter for iOS.`);

    // Manual filtering for iOS as a workaround for potential library issues
    const filteredSamples = samples.filter(record => {
      const recordDate = new Date(record.startDate || record.time);
      return recordDate >= startDate && recordDate <= endDate;
    });
    addLog(`[HealthKitService] Found ${filteredSamples.length} ${recordType} records after manual filtering for iOS.`);

    // Transform samples to match expected format
    return filteredSamples.map(s => {
      const baseRecord = {
        startTime: s.startDate,
        endTime: s.endDate,
        time: s.startDate,
        value: s.quantity,
      };
      switch (recordType) {
        case 'Steps': return { ...baseRecord };
        case 'ActiveCaloriesBurned':
        case 'TotalCaloriesBurned': return { ...baseRecord, energy: { inCalories: s.quantity } };
        case 'HeartRate': return { ...baseRecord, samples: [{ beatsPerMinute: s.quantity }] };
        case 'Weight': return { ...baseRecord, weight: { inKilograms: s.quantity } };
        case 'Height': return { ...baseRecord, height: { inMeters: s.quantity } };
        case 'BodyFat': return { ...baseRecord, percentage: { inPercent: s.quantity * 100 } };
        case 'BodyTemperature': return { ...baseRecord, temperature: { inCelsius: s.quantity } };
        case 'BloodGlucose': return { ...baseRecord, level: { inMillimolesPerLiter: s.quantity } };
        case 'OxygenSaturation': return { ...baseRecord, percentage: { inPercent: s.quantity * 100 } };
        case 'Vo2Max': return { ...baseRecord, vo2Max: s.quantity };
        case 'RestingHeartRate': return { ...baseRecord, beatsPerMinute: s.quantity };
        case 'RespiratoryRate': return { ...baseRecord, rate: s.quantity };
        case 'Distance': return { ...baseRecord, distance: { inMeters: s.quantity } };
        case 'FloorsClimbed': return { ...baseRecord, floors: s.quantity };
        case 'Hydration': return { ...baseRecord, volume: { inLiters: s.quantity } };
        case 'LeanBodyMass': return { ...baseRecord, mass: { inKilograms: s.quantity } };
        default: return baseRecord;
      }
    });
  } catch (error) {
    addLog(`[HealthKitService] Error reading ${recordType}: ${error.message}`, 'error', 'ERROR');
    return [];
  }
};

// Aggregation functions
export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const date = new Date(record.endTime || record.startTime).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = 0;
      acc[date] += record.value;
    } catch (e) { addLog(`[HealthKitService] Error processing step record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type: 'step' }));
  addLog(`[HealthKitService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const date = new Date(record.startTime).toISOString().split('T')[0];
      const heartRate = record.samples[0].beatsPerMinute;
      if (!acc[date]) acc[date] = { total: 0, count: 0 };
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (e) { addLog(`[HealthKitService] Error processing heart rate record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: Math.round(aggregatedData[date].total / aggregatedData[date].count), type: 'heart_rate' }));
  addLog(`[HealthKitService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

const aggregateCaloriesByDate = (records, type) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.startTime || record.endTime;
      if (timeToUse && record.energy?.inCalories) {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        if (!acc[date]) acc[date] = 0;
        acc[date] += record.energy.inCalories;
      }
    } catch (e) { addLog(`[HealthKitService] Error processing ${type} record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type }));
  addLog(`[HealthKitService] Aggregated ${type} data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  return aggregateCaloriesByDate(records, 'Active Calories');
};

export const aggregateTotalCaloriesByDate = (records) => {
  // This now correctly aggregates BasalEnergyBurned records
  return aggregateCaloriesByDate(records, 'total_calories');
};

// Transform function
export const transformHealthRecords = (records, metricConfig) => {
  if (!Array.isArray(records) || records.length === 0) return [];

  const transformedData = [];
  const { recordType, unit, type } = metricConfig;

  const getDateString = (date) => {
    if (!date) return null;
    try {
      return new Date(date).toISOString().split('T')[0];
    } catch (e) {
      addLog(`[HealthKitService] Could not convert date: ${date}`, 'warn', 'WARNING');
      return null;
    }
  };

  records.forEach((record) => {
    try {
      let value = null;
      let recordDate = null;
      let outputType = type;

      // Handle aggregated records first
      if (record.date && record.value !== undefined) {
        value = record.value;
        recordDate = record.date;
        outputType = record.type || outputType;
      }
      // Handle non-aggregated (raw) records
      else {
        switch (recordType) {
          case 'Weight':
            value = record.weight?.inKilograms;
            recordDate = getDateString(record.time);
            break;
          case 'BloodPressure':
            if (record.time) {
              const date = getDateString(record.time);
              if (record.systolic?.inMillimetersOfMercury) transformedData.push({ value: parseFloat(record.systolic.inMillimetersOfMercury.toFixed(2)), unit, date, type: `${type}_systolic` });
              if (record.diastolic?.inMillimetersOfMercury) transformedData.push({ value: parseFloat(record.diastolic.inMillimetersOfMercury.toFixed(2)), unit, date, type: `${type}_diastolic` });
            }
            return; // Skip main push
          case 'SleepSession':
            const start = new Date(record.startTime).getTime();
            const end = new Date(record.endTime).getTime();
            if (!isNaN(start) && !isNaN(end)) {
              value = (end - start) / (1000 * 60); // in minutes
              recordDate = getDateString(record.startTime);
            }
            break;
          case 'BodyFat':
          case 'OxygenSaturation':
            value = record.percentage?.inPercent;
            recordDate = getDateString(record.time);
            break;
          case 'BodyTemperature':
            value = record.temperature?.inCelsius;
            recordDate = getDateString(record.time);
            break;
          case 'BloodGlucose':
            value = record.level?.inMillimolesPerLiter;
            recordDate = getDateString(record.time);
            break;
          case 'Height':
            value = record.height?.inMeters;
            recordDate = getDateString(record.time);
            break;
          case 'Vo2Max':
            value = record.vo2Max;
            recordDate = getDateString(record.time);
            break;
          case 'RestingHeartRate':
            value = record.beatsPerMinute;
            recordDate = getDateString(record.time);
            break;
          case 'RespiratoryRate':
            value = record.rate;
            recordDate = getDateString(record.time);
            break;
          case 'Distance':
            value = record.distance?.inMeters;
            recordDate = getDateString(record.startTime);
            break;
          case 'FloorsClimbed':
            value = record.floors;
            recordDate = getDateString(record.startTime);
            break;
          case 'Hydration':
            value = record.volume?.inLiters;
            recordDate = getDateString(record.startTime);
            break;
          case 'LeanBodyMass':
            value = record.mass?.inKilograms;
            recordDate = getDateString(record.time);
            break;
          default:
            // For simple value records from aggregation
            if (record.value !== undefined && record.date) {
              value = record.value;
              recordDate = record.date;
              outputType = record.type || outputType;
            }
            break;
        }
      }

      if (value !== null && value !== undefined && !isNaN(value) && recordDate) {
        transformedData.push({
          value: parseFloat(value.toFixed(2)),
          type: outputType,
          date: recordDate,
          unit: unit,
        });
      }
    } catch (error) {
      addLog(`[HealthKitService] Error transforming record: ${error.message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthKitService] Successfully transformed ${transformedData.length} records for ${recordType}`);
  return transformedData;
};


// Storage functions
export const saveHealthPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, JSON.stringify(value));
    addLog(`[HealthKitService] Saved preference ${key}: ${JSON.stringify(value)}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save preference ${key}: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadHealthPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    addLog(`[HealthKitService] Failed to load preference ${key}: ${error.message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveStringPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, value);
    addLog(`[HealthKitService] Saved string preference ${key}: ${value}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save string preference ${key}: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadStringPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return value;
    }
    return null;
  } catch (error) {
    addLog(`[HealthKitService] Failed to load string preference ${key}: ${error.message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveSyncDuration = async (value) => {
  try {
    await AsyncStorage.setItem(SYNC_DURATION_KEY, value);
    addLog(`[HealthKitService] Saved sync duration: ${value}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save sync duration: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadSyncDuration = async () => {
  try {
    const value = await AsyncStorage.getItem(SYNC_DURATION_KEY);
    return value ?? '24h';
  } catch (error) {
    addLog(`[HealthKitService] Failed to load sync duration: ${error.message}`, 'error', 'ERROR');
    return '24h';
  }
};

// Main sync function
export const syncHealthData = async (syncDuration, healthMetricStates = {}) => {
  addLog(`[HealthKitService] Starting health data sync for duration: ${syncDuration}`);
  const startDate = getSyncStartDate(syncDuration);
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
      const rawRecords = await readHealthRecords(type, startDate, endDate);

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
        dataToTransform = aggregateStepsByDate(rawRecords);
      } else if (type === 'HeartRate') {
        dataToTransform = aggregateHeartRateByDate(rawRecords);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = aggregateActiveCaloriesByDate(rawRecords);
      } else if (type === 'TotalCaloriesBurned') {
        // Special Handling for iOS: Total Calories = Active + Basal (BMR)
        // HealthKit doesn't have a "Total" type, so we must manually fetch Active calories 
        // and combine them with the Basal calories we already fetched (rawRecords for TotalCaloriesBurned maps to Basal).

        try {
          addLog(`[HealthKitService] Fetching Active Calories to add to Total Calories calculation...`);
          const activeRecords = await readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

          if (activeRecords && activeRecords.length > 0) {
            addLog(`[HealthKitService] Found ${activeRecords.length} Active Calories records to merge with ${rawRecords.length} BMR records`);
            // Combine Basal (rawRecords) + Active (activeRecords)
            // The aggregation function simply sums all energy records by date, so this effectively calculates (Basal + Active)
            const combinedRecords = [...rawRecords, ...activeRecords];
            dataToTransform = aggregateTotalCaloriesByDate(combinedRecords);
          } else {
            addLog(`[HealthKitService] No Active Calories found to merge. Total Calories will only be BMR.`);
            dataToTransform = aggregateTotalCaloriesByDate(rawRecords);
          }
        } catch (err) {
          addLog(`[HealthKitService] Error fetching extra active calories for total calc: ${err.message}`, 'warn', 'WARNING');
          // Fallback to just BMR if active fails
          dataToTransform = aggregateTotalCaloriesByDate(rawRecords);
        }
      }

      const transformed = transformHealthRecords(dataToTransform, metricConfig);

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

// Convenience functions for background sync
export const readStepRecords = async (startDate, endDate) => readHealthRecords('Steps', startDate, endDate);
export const readActiveCaloriesRecords = async (startDate, endDate) => readHealthRecords('ActiveCaloriesBurned', startDate, endDate);
export const readHeartRateRecords = async (startDate, endDate) => readHealthRecords('HeartRate', startDate, endDate);
