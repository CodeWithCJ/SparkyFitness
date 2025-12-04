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

// Map health metric types to HealthKit identifiers
const HEALTHKIT_TYPE_MAP = {
  'Steps': 'HKQuantityTypeIdentifierStepCount',
  'HeartRate': 'HKQuantityTypeIdentifierHeartRate',
  'ActiveCaloriesBurned': 'HKQuantityTypeIdentifierActiveEnergyBurned',
  'TotalCaloriesBurned': 'HKQuantityTypeIdentifierBasalEnergyBurned',
  'Weight': 'HKQuantityTypeIdentifierBodyMass',
  'Height': 'HKQuantityTypeIdentifierHeight',
  'BodyFat': 'HKQuantityTypeIdentifierBodyFatPercentage',
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
};

// Alias for cross-platform compatibility - Android uses initHealthConnect
export const initHealthConnect = async () => {
  try {
    isHealthKitAvailable = await isHealthDataAvailable();
    if (!isHealthKitAvailable) {
      addLog('[HealthKitService] HealthKit is not available on this device', 'warn', 'WARNING');
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
    // On iOS, if Health app is not installed, we can't get permissions.
    // Let the user know they need to install it.
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

  // Separate read and write permissions and ensure uniqueness
  const readPermissionsSet = new Set();
  const writePermissionsSet = new Set();

  permissionsToRequest.forEach(p => {
    const healthkitIdentifier = HEALTHKIT_TYPE_MAP[p.recordType];
    if (healthkitIdentifier) {
      if (p.accessType === 'read') {
        readPermissionsSet.add(healthkitIdentifier);
      } else if (p.accessType === 'write') {
        writePermissionsSet.add(healthkitIdentifier);
      }
    }
  });

  const toRead = Array.from(readPermissionsSet);
  const toShare = Array.from(writePermissionsSet);

  if (toRead.length === 0 && toShare.length === 0) {
    addLog(`[HealthKitService] No valid HealthKit identifiers found for the requested permissions.`, 'warn', 'WARNING');
    return true;
  }

  try {
    addLog(`[HealthKitService] Requesting authorization - Read: [${toRead.join(', ')}], Write: [${toShare.join(', ')}]`, 'info', 'INFO');

    // The library expects separate read and write permissions in a single object.
    const result = await requestAuthorization({ toRead, toWrite: toShare });
    
    if (result) {
      addLog(`[HealthKitService] Authorization request completed successfully.`, 'info', 'SUCCESS');
    } else {
      addLog(`[HealthKitService] Authorization was not granted for all requested permissions.`, 'warn', 'WARNING');
    }
    
    return true;

  } catch (error) {
    addLog(`[HealthKitService] Failed to request permissions: ${error.message}`, 'error', 'ERROR');
    console.error('[HealthKitService] Permission request error', error);
    // Add a user-facing alert for unexpected errors
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
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 3);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
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
  // If HealthKit is not available, return empty array
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available, returning empty records for ${recordType}`, 'warn', 'WARNING');
    return [];
  }

  try {
    addLog(`[HealthKitService] Reading ${recordType} records from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Handle special cases
    if (recordType === 'SleepSession') {
      // Sleep uses category samples instead of quantity samples
      const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        from: startDate,
        to: endDate,
      });

      addLog(`[HealthKitService] Read ${samples.length} Sleep records`);
      return samples.map(s => ({
        startTime: s.startDate,
        endTime: s.endDate,
      }));
    }

    if (recordType === 'BloodPressure') {
      // Blood pressure requires reading both systolic and diastolic
      const systolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', {
        from: startDate,
        to: endDate,
      });

      const diastolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', {
        from: startDate,
        to: endDate,
      });

      // Combine systolic and diastolic readings by matching timestamps
      const bpMap = new Map();

      systolicSamples.forEach(s => {
        const key = s.startDate;
        bpMap.set(key, {
          systolic: s.quantity,
          time: s.startDate
        });
      });

      diastolicSamples.forEach(s => {
        const key = s.startDate;
        const existing = bpMap.get(key);
        if (existing) {
          existing.diastolic = s.quantity;
        } else {
          bpMap.set(key, {
            diastolic: s.quantity,
            time: s.startDate
          });
        }
      });

      const results = Array.from(bpMap.values())
        .filter(r => r.systolic && r.diastolic)
        .map(r => ({
          systolic: { inMillimetersOfMercury: r.systolic },
          diastolic: { inMillimetersOfMercury: r.diastolic },
          time: r.time,
        }));

      addLog(`[HealthKitService] Read ${results.length} BloodPressure records`);
      return results;
    }

    // Handle all other quantity types
    addLog(`[HealthKitService] Reading ${recordType} records from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const quantityType = HEALTHKIT_TYPE_MAP[recordType];
    if (!quantityType) {
      addLog(`[HealthKitService] Unsupported record type: ${recordType}`, 'warn', 'WARNING');
      return [];
    }

    const samples = await queryQuantitySamples(quantityType, {
      from: startDate,
      to: endDate,
    });

    addLog(`[HealthKitService] Read ${samples.length} ${recordType} records, applying manual filter for iOS.`);

    // Manual filtering for iOS as a workaround for potential library issues
    const filteredSamples = samples.filter(record => {
      const recordDate = new Date(record.startDate || record.time);
      return recordDate >= startDate && recordDate <= endDate;
    });

    addLog(`[HealthKitService] Found ${filteredSamples.length} ${recordType} records after manual filtering for iOS.`);

    // Transform samples to match expected format
    return filteredSamples.map(s => {
      switch (recordType) {
        case 'Steps':
          return {
            value: s.quantity,
            startTime: s.startDate,
            endTime: s.endDate,
          };

        case 'ActiveCaloriesBurned':
        case 'TotalCaloriesBurned':
          return {
            energy: { inCalories: s.quantity },
            startTime: s.startDate,
            endTime: s.endDate,
          };

        case 'HeartRate':
          return {
            samples: [{ beatsPerMinute: s.quantity }],
            startTime: s.startDate,
          };

        case 'Weight':
          return {
            weight: { inKilograms: s.quantity },
            time: s.startDate,
          };

        case 'Height':
          return {
            height: { inMeters: s.quantity },
            time: s.startDate,
          };

        case 'BodyFat':
          return {
            percentage: { inPercent: s.quantity * 100 }, // HealthKit returns as decimal
            time: s.startDate,
          };

        case 'BodyTemperature':
          return {
            temperature: { inCelsius: s.quantity },
            time: s.startDate,
          };

        case 'BloodGlucose':
          return {
            level: { inMillimolesPerLiter: s.quantity },
            time: s.startDate,
          };

        case 'OxygenSaturation':
          return {
            percentage: { inPercent: s.quantity * 100 }, // HealthKit returns as decimal
            time: s.startDate,
          };

        case 'Vo2Max':
          return {
            vo2Max: s.quantity,
            time: s.startDate,
          };

        case 'RestingHeartRate':
          return {
            beatsPerMinute: s.quantity,
            time: s.startDate,
          };

        case 'RespiratoryRate':
          return {
            rate: s.quantity,
            time: s.startDate,
          };

        case 'Distance':
          return {
            distance: { inMeters: s.quantity },
            startTime: s.startDate,
          };

        case 'FloorsClimbed':
          return {
            floors: s.quantity,
            startTime: s.startDate,
          };

        case 'Hydration':
          return {
            volume: { inLiters: s.quantity },
            startTime: s.startDate,
          };

        case 'LeanBodyMass':
          return {
            mass: { inKilograms: s.quantity },
            time: s.startDate,
          };

        default:
          return {
            value: s.quantity,
            time: s.startDate,
          };
      }
    });
  } catch (error) {
    addLog(`[HealthKitService] Error reading ${recordType}: ${error.message}`, 'error', 'ERROR');
    return [];
  }
};

// Aggregation functions (reuse from healthConnectService)
export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthKitService] aggregateStepsByDate received non-array records`, 'warn', 'WARNING');
    return [];
  }

  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.endTime || record.startTime;
      if (timeToUse) {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        const steps = record.value;

        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += steps;
      }
    } catch (error) {
      addLog(`[HealthKitService] Error processing step record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'step',
  }));

  addLog(`[HealthKitService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthKitService] aggregateHeartRateByDate received non-array records`, 'warn', 'WARNING');
    return [];
  }

  const aggregatedData = records.reduce((acc, record) => {
    try {
      if (record.startTime) {
        const date = new Date(record.startTime).toISOString().split('T')[0];
        const heartRate = record.samples[0].beatsPerMinute;

        if (!acc[date]) {
          acc[date] = { total: 0, count: 0 };
        }
        acc[date].total += heartRate;
        acc[date].count++;
      }
    } catch (error) {
      addLog(`[HealthKitService] Error processing heart rate record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date].count > 0 ? Math.round(aggregatedData[date].total / aggregatedData[date].count) : 0,
    type: 'heart_rate',
  }));

  addLog(`[HealthKitService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthKitService] aggregateActiveCaloriesByDate received non-array records`, 'warn', 'WARNING');
    return [];
  }

  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.startTime || record.endTime;
      if (timeToUse && record.energy && typeof record.energy.inCalories === 'number') {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        const calories = record.energy.inCalories;

        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += calories;
      }
    } catch (error) {
      addLog(`[HealthKitService] Error processing active calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'Active Calories',
  }));

  addLog(`[HealthKitService] Aggregated active calories data into ${result.length} daily entries`);
  return result;
};

export const aggregateTotalCaloriesByDate = async (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthKitService] aggregateTotalCaloriesByDate received non-array records`, 'warn', 'WARNING');
    return [];
  }

  const bmrValue = 1691; // Default fallback

  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.startTime || record.endTime;
      if (timeToUse && record.energy && typeof record.energy.inCalories === 'number') {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        const calories = record.energy.inCalories;

        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += calories;
      }
    } catch (error) {
      addLog(`[HealthKitService] Error processing total calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const sedentaryTDEE = bmrValue * 1.2;
  const result = [];

  Object.keys(aggregatedData).forEach(date => {
    const exerciseCalories = aggregatedData[date];

    result.push({
      date,
      value: exerciseCalories,
      type: 'Active Calories',
    });

    result.push({
      date,
      value: exerciseCalories + sedentaryTDEE,
      type: 'total_calories',
    });
  });

  addLog(`[HealthKitService] Aggregated total calories data into ${result.length} entries`);
  return result;
};

// Transform function (reuse from healthConnectService)
export const transformHealthRecords = (records, metricConfig) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthKitService] transformHealthRecords received non-array records`, 'warn', 'WARNING');
    return [];
  }

  if (records.length === 0) {
    addLog(`[HealthKitService] No records to transform for ${metricConfig.recordType}`);
    return [];
  }

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

  records.forEach((record, index) => {
    try {
      let value = null;
      let recordDate = null;
      let outputType = type;

      if (['Steps', 'HeartRate', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(recordType)) {
        if (record.value !== undefined && record.date) {
          value = record.value;
          recordDate = record.date;
          if (record.type) {
            outputType = record.type;
          }
        }
      } else {
        switch (recordType) {
          case 'Weight':
            if (record.time && record.weight?.inKilograms) {
              value = record.weight.inKilograms;
              recordDate = getDateString(record.time);
            }
            break;

          case 'BloodPressure':
            if (record.time) {
              const date = getDateString(record.time);
              if (record.systolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(record.systolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_systolic`,
                });
              }
              if (record.diastolic?.inMillimetersOfMercury) {
                transformedData.push({
                  value: parseFloat(record.diastolic.inMillimetersOfMercury.toFixed(2)),
                  unit: unit,
                  date: date,
                  type: `${type}_diastolic`,
                });
              }
            }
            return;

          case 'SleepSession':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime).getTime();
              const end = new Date(record.endTime).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                value = (end - start) / (1000 * 60);
                recordDate = getDateString(record.startTime);
              }
            }
            break;

          case 'BodyFat':
            if (record.percentage?.inPercent !== undefined) {
              value = record.percentage.inPercent;
              recordDate = getDateString(record.time);
            }
            break;

          case 'BodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = getDateString(record.time);
            }
            break;

          case 'BloodGlucose':
            if (record.level?.inMillimolesPerLiter) {
              value = record.level.inMillimolesPerLiter;
              recordDate = getDateString(record.time);
            }
            break;

          case 'Height':
            if (record.time && record.height?.inMeters) {
              value = record.height.inMeters;
              recordDate = getDateString(record.time);
            }
            break;

          case 'OxygenSaturation':
            if (record.percentage?.inPercent !== undefined) {
              value = record.percentage.inPercent;
              recordDate = getDateString(record.time);
            }
            break;

          case 'Vo2Max':
            if (record.vo2Max !== undefined) {
              value = record.vo2Max;
              recordDate = getDateString(record.time);
            }
            break;

          case 'RestingHeartRate':
            if (record.beatsPerMinute !== undefined) {
              value = record.beatsPerMinute;
              recordDate = getDateString(record.time);
            }
            break;

          case 'RespiratoryRate':
            if (record.rate !== undefined) {
              value = record.rate;
              recordDate = getDateString(record.time);
            }
            break;

          case 'Distance':
            if (record.startTime && record.distance?.inMeters) {
              value = record.distance.inMeters;
              recordDate = getDateString(record.startTime);
            }
            break;

          case 'FloorsClimbed':
            if (record.startTime && typeof record.floors === 'number') {
              value = record.floors;
              recordDate = getDateString(record.startTime);
            }
            break;

          case 'Hydration':
            if (record.startTime && record.volume?.inLiters) {
              value = record.volume.inLiters;
              recordDate = getDateString(record.startTime);
            }
            break;

          case 'LeanBodyMass':
            if (record.mass?.inKilograms) {
              value = record.mass.inKilograms;
              recordDate = getDateString(record.time);
            }
            break;

          case 'ExerciseSession':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime).getTime();
              const end = new Date(record.endTime).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                value = (end - start) / (1000 * 60);
                recordDate = getDateString(record.startTime);
              }
            }
            break;

          case 'BasalMetabolicRate':
            if (record.basalMetabolicRate?.inKilocaloriesPerDay !== undefined) {
              value = record.basalMetabolicRate.inKilocaloriesPerDay;
              recordDate = getDateString(record.time);
            }
            break;

          default:
            addLog(`[HealthKitService] Unhandled record type: ${recordType}`, 'warn', 'WARNING');
            return;
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

  addLog(`[HealthKitService] Successfully transformed ${transformedData.length} records`);
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
    if (value !== null) {
      return value;
    }
    return '24h';
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

      if (rawRecords.length === 0) {
        addLog(`[HealthKitService] No ${type} records found`);
        continue;
      }

      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'warn', 'WARNING');
        continue;
      }

      let dataToTransform = rawRecords;

      if (type === 'Steps') {
        dataToTransform = aggregateStepsByDate(rawRecords);
      } else if (type === 'HeartRate') {
        dataToTransform = aggregateHeartRateByDate(rawRecords);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = aggregateActiveCaloriesByDate(rawRecords);
      } else if (type === 'TotalCaloriesBurned') {
        dataToTransform = await aggregateTotalCaloriesByDate(rawRecords);
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

  addLog(`[HealthKitService] Total transformed data entries: ${allTransformedData.length}`);

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      addLog(`[HealthKitService] Server sync response: ${JSON.stringify(apiResponse)}`);
      return { success: true, apiResponse, syncErrors };
    } catch (error) {
      addLog(`[HealthKitService] Error sending data to server: ${error.message}`);
      return { success: false, error: error.message, syncErrors };
    }
  } else {
    addLog(`[HealthKitService] No health data to sync.`);
    return { success: true, message: "No health data to sync.", syncErrors };
  }
};

// Convenience functions for background sync compatibility with Android
export const readStepRecords = async (startDate, endDate) => readHealthRecords('Steps', startDate, endDate);
export const readActiveCaloriesRecords = async (startDate, endDate) => readHealthRecords('ActiveCaloriesBurned', startDate, endDate);
export const readHeartRateRecords = async (startDate, endDate) => readHealthRecords('HeartRate', startDate, endDate);
