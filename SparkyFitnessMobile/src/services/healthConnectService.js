import {
  initialize,
  requestPermission,
  readRecords,
  HeartRateRecord,
  WeightRecord,
  BloodPressureRecord,
  NutritionRecord,
  SleepSessionRecord,
  StepsRecord,
  ActiveCaloriesBurnedRecord,
  BasalBodyTemperatureRecord,
  BasalMetabolicRateRecord,
  BloodGlucoseRecord,
  BodyFatRecord,
  BodyTemperatureRecord,
  BoneMassRecord,
  CervicalMucusRecord,
  DistanceRecord,
  ElevationGainedRecord,
  ExerciseSessionRecord,
  FloorsClimbedRecord,
  HeightRecord,
  HydrationRecord,
  LeanBodyMassRecord,
  MenstruationFlowRecord,
  OvulationTestRecord,
  OxygenSaturationRecord,
  PowerRecord,
  RespiratoryRateRecord,
  RestingHeartRateRecord,
  SexualActivityRecord,
  SpeedRecord,
  Vo2MaxRecord,
  WheelchairPushesRecord,
} from 'react-native-health-connect';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import * as api from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';

const SYNC_DURATION_KEY = '@HealthConnect:syncDuration';

export const initHealthConnect = async () => {
  try {
    const isInitialized = await initialize();
    return isInitialized;
  } catch (error) {
    addLog(`[HealthConnectService] Failed to initialize Health Connect: ${error.message}`);
    console.error('Failed to initialize Health Connect', error);
    return false;
  }
};

export const requestHealthPermissions = async (permissionsToRequest) => {
  try {
    addLog(`[HealthConnectService] Requesting permissions: ${JSON.stringify(permissionsToRequest)}`);
    const grantedPermissions = await requestPermission(permissionsToRequest);

    const allGranted = permissionsToRequest.every(requestedPerm =>
      grantedPermissions.some(grantedPerm =>
        grantedPerm.recordType === requestedPerm.recordType &&
        grantedPerm.accessType === requestedPerm.accessType
      )
    );

    if (allGranted) {
      addLog(`[HealthConnectService] All requested permissions granted.`);
      console.log('[HealthConnectService] All requested permissions granted.');
      return true;
    } else {
      addLog(`[HealthConnectService] Not all requested permissions granted. Requested: ${JSON.stringify(permissionsToRequest)}. Granted: ${JSON.stringify(grantedPermissions)}`);
      console.log('[HealthConnectService] Not all requested permissions granted.', { requested: permissionsToRequest, granted: grantedPermissions });
      return false;
    }
  } catch (error) {
    addLog(`[HealthConnectService] Failed to request health permissions: ${error.message}. Full error: ${JSON.stringify(error)}`);
    console.error('Failed to request health permissions', error);
    throw error;
  }
};

export const readHealthRecords = async (recordType, startDate, endDate) => {
  try {
    const startTime = startDate.toISOString();
    const endTime = endDate.toISOString();
    addLog(`[HealthConnectService] Reading ${recordType} records for timerange: ${startTime} to ${endTime}`);
    const result = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime,
        endTime: endTime,
      },
    });
    addLog(`[HealthConnectService] Read ${result.records.length} ${recordType} records from Health Connect`);
    return result.records || [];
  } catch (error) {
    addLog(`[HealthConnectService] Failed to read ${recordType} records: ${error.message}. Full error: ${JSON.stringify(error)}`, 'error', 'ERROR');
    console.error(`Failed to read ${recordType} records`, error);
    return [];
  }
};

export const readStepRecords = async (startDate, endDate) => readHealthRecords('Steps', startDate, endDate);

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
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
  return startDate;
};

export const readActiveCaloriesRecords = async (startDate, endDate) => readHealthRecords('ActiveCaloriesBurned', startDate, endDate);

export const readHeartRateRecords = async (startDate, endDate) => readHealthRecords('HeartRate', startDate, endDate);

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateHeartRateByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateHeartRateByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record => 
    record.startTime && record.samples && Array.isArray(record.samples)
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid heart rate records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} heart rate records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];
      const heartRate = record.samples.reduce((sum, sample) => 
        sum + (sample.beatsPerMinute || 0), 0) / record.samples.length;

      if (!acc[date]) {
        acc[date] = { total: 0, count: 0 };
      }
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing heart rate record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date].count > 0 ? Math.round(aggregatedData[date].total / aggregatedData[date].count) : 0,
    type: 'heart_rate',
  }));

  addLog(`[HealthConnectService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateStepsByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateStepsByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record => 
    record.startTime && typeof record.count === 'number'
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid step records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} step records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];
      const steps = record.count;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += steps;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing step record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'step',
  }));

  addLog(`[HealthConnectService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateActiveCaloriesByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateActiveCaloriesByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record => 
    record.startTime && record.energy && typeof record.energy.inCalories === 'number'
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid active calories records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} active calories records`);

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];
      const calories = record.energy.inCalories;

      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += calories;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing active calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date],
    type: 'active_calories',
  }));

  addLog(`[HealthConnectService] Aggregated active calories data into ${result.length} daily entries`);
  return result;
};

export const transformHealthRecords = (records, metricConfig) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] transformHealthRecords received non-array records for ${metricConfig.recordType}: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn(`transformHealthRecords received non-array records for ${metricConfig.recordType}:`, records);
    return [];
  }

  if (records.length === 0) {
    addLog(`[HealthConnectService] No records to transform for ${metricConfig.recordType}`);
    return [];
  }

  const transformedData = [];
  const { recordType, unit, type } = metricConfig;

  addLog(`[HealthConnectService] Transforming ${records.length} ${recordType} records`);

  records.forEach((record, index) => {
    try {
      let value = null;
      let recordDate = null;

      if (['Steps', 'HeartRate', 'ActiveCaloriesBurned'].includes(recordType)) {
        if (record.value !== undefined && record.date) {
          value = record.value;
          recordDate = record.date;
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

          case 'Nutrition':
            if (record.startTime && record.energy?.inCalories) {
              value = record.energy.inCalories;
              recordDate = record.startTime.split('T')[0];
            }
            break;

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

          case 'BasalBodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BasalMetabolicRate':
            if (record.startTime && record.basalMetabolicRate?.inCalories) {
              value = record.basalMetabolicRate.inCalories;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'BloodGlucose':
            if (record.time && record.bloodGlucose?.inMillimolesPerLiter) {
              value = record.bloodGlucose.inMillimolesPerLiter;
              recordDate = record.time.split('T')[0];
            }
            break;

          // Add this to healthConnectService.js in the transformHealthRecords function
          // Replace the existing 'BodyFat' case with this debug version:

          case 'BodyFat':
            // Log what we're working with
            if (index === 0) {
              console.log('[Transform BodyFat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BodyFat sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }
  
            // Extract value using multiple strategies
            let bodyFatValue = null;
  
            // Strategy 1: Check percentage.inPercent (most common)
            if (record.percentage?.inPercent != null) {
              bodyFatValue = record.percentage.inPercent;
            }
            // Strategy 2: Check direct percentage as number
            else if (typeof record.percentage === 'number') {
              bodyFatValue = record.percentage;
            }
            // Strategy 3: Check value field
            else if (record.value != null && typeof record.value === 'number') {
              bodyFatValue = record.value;
            }
            // Strategy 4: Check bodyFat field
            else if (record.bodyFat != null && typeof record.bodyFat === 'number') {
              bodyFatValue = record.bodyFat;
            }
            // Strategy 5: Check bodyFatPercentage
            else if (record.bodyFatPercentage?.inPercent != null) {
              bodyFatValue = record.bodyFatPercentage.inPercent;
            }
  
            // Extract date using multiple strategies
            let bodyFatDate = null;
            const dateSource = record.time || record.startTime || record.timestamp || record.date;
  
            if (dateSource) {
              try {
                bodyFatDate = typeof dateSource === 'string' ? dateSource.split('T')[0] : dateSource;
              } catch (e) {
                addLog(`[Transform] Error parsing BodyFat date: ${e.message}`, 'warn', 'WARNING');
              }
            }
  
            // Final validation and assignment
            const isValidValue = bodyFatValue != null && !isNaN(bodyFatValue) && bodyFatValue >= 0 && bodyFatValue <= 100;
            const isValidDate = bodyFatDate != null && bodyFatDate.length > 0;
  
            if (isValidValue && isValidDate) {
              value = bodyFatValue;
              recordDate = bodyFatDate;
              if (index === 0) {
                addLog(`[Transform] BodyFat SUCCESS: ${value}% on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidValue) {
                  issues.push(`invalid value (${bodyFatValue})`);
                }
                if (!isValidDate) {
                  issues.push(`invalid date (${bodyFatDate})`);
                }
                addLog(`[Transform] BodyFat FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'BodyTemperature':
            if (record.time && record.temperature?.inCelsius) {
              value = record.temperature.inCelsius;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'BoneMass':
            if (record.mass?.inKilograms) {
              value = record.mass.inKilograms;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'Distance':
            if (record.startTime && record.distance?.inMeters) {
              value = record.distance.inMeters;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'ElevationGained':
            if (record.startTime && record.elevation?.inMeters) {
              value = record.elevation.inMeters;
              recordDate = record.startTime.split('T')[0];
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

          case 'FloorsClimbed':
            if (record.startTime && typeof record.floors === 'number') {
              value = record.floors;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'Height':
            if (record.time && record.height?.inMeters) {
              value = record.height.inMeters;
              recordDate = record.time.split('T')[0];
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
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'OxygenSaturation':
            if (record.time && record.percentage?.inPercent) {
              value = record.percentage.inPercent;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'Power':
            if (record.startTime && record.power?.inWatts) {
              value = record.power.inWatts;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'RespiratoryRate':
            if (record.rate) {
              value = record.rate;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'RestingHeartRate':
            if (record.time && typeof record.beatsPerMinute === 'number') {
              value = record.beatsPerMinute;
              recordDate = record.time.split('T')[0];
            }
            break;

          case 'Speed':
            if (record.startTime && record.speed?.inMetersPerSecond) {
              value = record.speed.inMetersPerSecond;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'Vo2Max':
            if (record.vo2Max) {
              value = record.vo2Max;
              recordDate = (record.time || record.startTime)?.split('T')[0];
            }
            break;

          case 'WheelchairPushes':
            if (record.startTime && typeof record.count === 'number') {
              value = record.count;
              recordDate = record.startTime.split('T')[0];
            }
            break;

          case 'CervicalMucus':
          case 'MenstruationFlow':
          case 'OvulationTest':
          case 'SexualActivity':
            addLog(`[HealthConnectService] Skipping qualitative ${recordType} record`);
            return;

          default:
            addLog(`[HealthConnectService] Unhandled record type in transformation: ${recordType}`, 'warn', 'WARNING');
            return;
        }
      }

      if (value !== null && value !== undefined && !isNaN(value) && recordDate) {
        transformedData.push({
          value: parseFloat(value.toFixed(2)),
          type: type,
          date: recordDate,
          unit: unit,
        });
      }
    } catch (error) {
      addLog(`[HealthConnectService] Error transforming ${recordType} record at index ${index}: ${error.message}`, 'warn', 'WARNING');
    }
  });

  addLog(`[HealthConnectService] Successfully transformed ${transformedData.length} ${recordType} records`);
  return transformedData;
};

export const saveHealthPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthConnect:${key}`, JSON.stringify(value));
    addLog(`[HealthConnectService] Saved preference ${key}: ${JSON.stringify(value)}`);
  } catch (error) {
    addLog(`[HealthConnectService] Failed to save preference ${key}: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to save preference ${key}`, error);
  }
};

export const loadHealthPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthConnect:${key}`);
    if (value !== null) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    addLog(`[HealthConnectService] Failed to load preference ${key}: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to load preference ${key}`, error);
    return null;
  }
};

export const saveStringPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthConnect:${key}`, value);
    addLog(`[HealthConnectService] Saved string preference ${key}: ${value}`);
  } catch (error) {
    addLog(`[HealthConnectService] Failed to save string preference ${key}: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to save string preference ${key}`, error);
  }
};

export const loadStringPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthConnect:${key}`);
    if (value !== null) {
      return value;
    }
    return null;
  } catch (error) {
    addLog(`[HealthConnectService] Failed to load string preference ${key}: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to load string preference ${key}`, error);
    return null;
  }
};

export const saveSyncDuration = async (value) => {
  try {
    await AsyncStorage.setItem(SYNC_DURATION_KEY, value);
    addLog(`[HealthConnectService] Saved sync duration: ${value}`);
  } catch (error) {
    addLog(`[HealthConnectService] Failed to save sync duration: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to save sync duration`, error);
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
    addLog(`[HealthConnectService] Failed to load sync duration: ${error.message}`, 'error', 'ERROR');
    console.error(`Failed to load sync duration`, error);
    return '24h';
  }
};

export const syncHealthData = async (syncDuration, healthMetricStates = {}) => {
  addLog(`[HealthConnectService] Starting health data sync for duration: ${syncDuration}`);
  const startDate = getSyncStartDate(syncDuration);

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
      addLog(`[HealthConnectService] Reading ${type} records...`);
      const rawRecords = await readHealthRecords(type, startDate, endDate);
      
      if (rawRecords.length === 0) {
        addLog(`[HealthConnectService] No ${type} records found`);
        continue;
      }

      addLog(`[HealthConnectService] Found ${rawRecords.length} raw ${type} records`);
      
      const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
      if (!metricConfig) {
        addLog(`[HealthConnectService] No metric configuration found for record type: ${type}. Skipping.`, 'warn', 'WARNING');
        continue;
      }

      let dataToTransform = rawRecords;
      
      if (type === 'Steps') {
        dataToTransform = aggregateStepsByDate(rawRecords);
        addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw Steps records into ${dataToTransform.length} daily totals`);
      } else if (type === 'HeartRate') {
        dataToTransform = aggregateHeartRateByDate(rawRecords);
        addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw HeartRate records into ${dataToTransform.length} daily averages`);
      } else if (type === 'ActiveCaloriesBurned') {
        dataToTransform = aggregateActiveCaloriesByDate(rawRecords);
        addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw ActiveCaloriesBurned records into ${dataToTransform.length} daily totals`);
      }

      const transformed = transformHealthRecords(dataToTransform, metricConfig);
      
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
