import {
  requestAuthorization,
  queryQuantitySamples,
  isHealthDataAvailable,
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';

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
    // Check if HealthKit is available on this device
    const available = await isHealthDataAvailable();

    if (!available) {
      addLog('[HealthKitService] HealthKit is not available on this device', 'warn', 'WARNING');
      console.warn('[HealthKitService] HealthKit not available');
      isHealthKitAvailable = false;
      return false;
    }

    // Skip HealthKit authorization in simulator by default - it can hang on some setups.
    // Allow overriding for development testing by setting `global.FORCE_HEALTHKIT_ON_SIM = true`.
    const isSimulatorDetected = __DEV__ && (
      Platform.OS === 'ios' &&
      //(Platform.constants?.simulator === true || Platform.isPad === false)
      Platform.constants?.simulator === true
    );

    // Respect developer override if explicitly set in `index.js` or other startup code.
    const forceHealthOnSim = !!global?.FORCE_HEALTHKIT_ON_SIM;

    if (isSimulatorDetected && !forceHealthOnSim) {
      addLog('[HealthKitService] Running in simulator - skipping HealthKit authorization', 'warn', 'WARNING');
      console.warn('[HealthKitService] Simulator detected - HealthKit authorization skipped. Use a physical device for full functionality.');
      isHealthKitAvailable = false;
      return false;
    }

    // Build list of permissions to request
    const readPermissions = [
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
    ];

    // Request authorization with timeout
    console.log('[HealthKitService] Requesting authorization...');
    const authPromise = requestAuthorization(readPermissions);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Authorization request timed out')), 10000)
    );

    await Promise.race([authPromise, timeoutPromise]);

    addLog('[HealthKitService] HealthKit initialized successfully', 'info', 'SUCCESS');
    isHealthKitAvailable = true;
    return true;
  } catch (error) {
    addLog(`[HealthKitService] Failed to initialize HealthKit: ${error.message}`, 'error', 'ERROR');
    console.error('[HealthKitService] HealthKit initialization error', error);
    isHealthKitAvailable = false;
    return false;
  }
};

export const requestHealthPermissions = async (permissionsToRequest) => {
  // HealthKit permissions are requested during initialization
  // This function exists for API compatibility with Health Connect
  addLog(`[HealthKitService] Permissions already requested during initialization`);
  return true;
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
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
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
    const quantityType = HEALTHKIT_TYPE_MAP[recordType];
    if (!quantityType) {
      addLog(`[HealthKitService] Unsupported record type: ${recordType}`, 'warn', 'WARNING');
      return [];
    }

    const samples = await queryQuantitySamples(quantityType, {
      from: startDate,
      to: endDate,
    });

    addLog(`[HealthKitService] Read ${samples.length} ${recordType} records`);

    // Transform samples to match expected format
    return samples.map(s => {
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
      const date = timeToUse.split('T')[0];
      const steps = record.value;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += steps;
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
      const date = record.startTime.split('T')[0];
      const heartRate = record.samples[0].beatsPerMinute;

      if (!acc[date]) {
        acc[date] = { total: 0, count: 0 };
      }
      acc[date].total += heartRate;
      acc[date].count++;
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
      const date = record.startTime.split('T')[0];
      const calories = record.energy.inCalories;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += calories;
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
      const date = record.startTime.split('T')[0];
      const caloriesValue = record.energy.inCalories;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += caloriesValue;
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
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BloodPressure':
            if (record.time) {
              const date = record.time.split('T')[0];
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
                recordDate = record.startTime.split('T')[0];
              }
            }
            break;

          case 'BodyFat':
            if (record.percentage?.inPercent !== undefined) {
              value = record.percentage.inPercent;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'BodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BloodGlucose':
            if (record.level?.inMillimolesPerLiter) {
              value = record.level.inMillimolesPerLiter;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'Height':
            if (record.time && record.height?.inMeters) {
              value = record.height.inMeters;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'OxygenSaturation':
            if (record.percentage?.inPercent !== undefined) {
              value = record.percentage.inPercent;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'Vo2Max':
            if (record.vo2Max !== undefined) {
              value = record.vo2Max;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'RestingHeartRate':
            if (record.beatsPerMinute !== undefined) {
              value = record.beatsPerMinute;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'RespiratoryRate':
            if (record.rate !== undefined) {
              value = record.rate;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'Distance':
            if (record.startTime && record.distance?.inMeters) {
              value = record.distance.inMeters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'FloorsClimbed':
            if (record.startTime && typeof record.floors === 'number') {
              value = record.floors;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'Hydration':
            if (record.startTime && record.volume?.inLiters) {
              value = record.volume.inLiters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'LeanBodyMass':
            if (record.mass?.inKilograms) {
              value = record.mass.inKilograms;
              recordDate = record.time?.split('T')[0];
            }
            break;

          case 'ExerciseSession':
            if (record.startTime && record.endTime) {
              const start = new Date(record.startTime).getTime();
              const end = new Date(record.endTime).getTime();
              if (!isNaN(start) && !isNaN(end)) {
                value = (end - start) / (1000 * 60);
                recordDate = record.startTime.split('T')[0];
              }
            }
            break;

          case 'BasalMetabolicRate':
            if (record.basalMetabolicRate?.inKilocaloriesPerDay !== undefined) {
              value = record.basalMetabolicRate.inKilocaloriesPerDay;
              recordDate = record.time?.split('T')[0];
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
