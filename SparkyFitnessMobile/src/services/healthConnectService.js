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
  TotalCaloriesBurnedRecord,
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

// The issue is around line 200-240. Here's the corrected section:

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

export const aggregateTotalCaloriesByDate = async (records) => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] aggregateTotalCaloriesByDate received non-array records: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    console.warn('aggregateTotalCaloriesByDate received non-array records:', records);
    return [];
  }

  const validRecords = records.filter(record => 
    record.startTime && record.energy && typeof record.energy.inCalories === 'number'
  );

  if (validRecords.length === 0) {
    addLog(`[HealthConnectService] No valid total calories records to aggregate`);
    return [];
  }

  addLog(`[HealthConnectService] Aggregating ${validRecords.length} total calories records`);

  // Read BMR records to get the baseline
  let bmrValue = 1691; // Default fallback
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // Look back 90 days for BMR
    
    const bmrRecords = await readHealthRecords('BasalMetabolicRate', startDate, endDate);
    
    if (bmrRecords.length > 0) {
      // Get the most recent BMR
      const sortedBMR = bmrRecords.sort((a, b) => {
        const dateA = new Date(a.time || a.startTime);
        const dateB = new Date(b.time || b.startTime);
        return dateB - dateA;
      });
      
      const latestBMR = sortedBMR[0];
      if (latestBMR.basalMetabolicRate?.inKilocaloriesPerDay) {
        bmrValue = latestBMR.basalMetabolicRate.inKilocaloriesPerDay;
        addLog(`[HealthConnectService] Using BMR value: ${bmrValue} kcal/day`, 'info');
      }
    } else {
      addLog(`[HealthConnectService] No BMR records found, using default: ${bmrValue} kcal/day`, 'warn', 'WARNING');
    }
  } catch (error) {
    addLog(`[HealthConnectService] Error reading BMR: ${error.message}, using default: ${bmrValue}`, 'warn', 'WARNING');
  }

  const aggregatedData = validRecords.reduce((acc, record) => {
    try {
      const date = record.startTime.split('T')[0];
      const caloriesValue = record.energy.inCalories;
      
      // Detect if value is in calories (>10000) or kilocalories (<10000)
      const activeKilocalories = caloriesValue > 10000 ? caloriesValue / 1000 : caloriesValue;
      
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += activeKilocalories;
    } catch (error) {
      addLog(`[HealthConnectService] Error processing total calories record: ${error.message}`, 'warn', 'WARNING');
    }

    return acc;
  }, {});

  // Add BMR to each day's total
  // Add BMR × 1.2 (sedentary TDEE) to each day's active calories
  const sedentaryTDEE = bmrValue * 1.2;
  const result = Object.keys(aggregatedData).map(date => ({
    date,
    value: aggregatedData[date] + sedentaryTDEE, // Add sedentary TDEE to active calories
    type: 'total_calories',
  }));

  addLog(`[HealthConnectService] Aggregated total calories data into ${result.length} daily entries (BMR × 1.2 + active = ${sedentaryTDEE.toFixed(0)} + active)`);
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

      if (['Steps', 'HeartRate', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(recordType)) {
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


          case 'ActiveCaloriesBurned':
            // Check if this is an aggregated record or raw record
            if (record.value !== undefined && record.date && record.type === 'active_calories') {
              // Already aggregated from aggregateActiveCaloriesByDate
              value = record.value;
              recordDate = record.date;
              if (index === 0) {
                addLog(`[Transform] ActiveCalories (aggregated): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.startTime && record.energy?.inCalories != null) {
              // Raw record - shouldn't happen if aggregation is working, but handle it
              value = record.energy.inCalories;
              recordDate = record.startTime.split('T')[0];
              if (index === 0) {
                addLog(`[Transform] ActiveCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.energy?.inKilocalories != null) {
              value = record.energy.inKilocalories;
              const dateField = record.startTime || record.time || record.date;
              recordDate = dateField ? dateField.split('T')[0] : null;
              if (index === 0 && recordDate) {
                addLog(`[Transform] ActiveCalories (alt format): ${value} kcal on ${recordDate}`, 'debug');
              }
            }
  
            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] ActiveCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
            }
            break;

          case 'TotalCaloriesBurned':
            if (record.value !== undefined && record.date && record.type === 'total_calories') {
              // Already aggregated and converted to kcal
              value = record.value;
              recordDate = record.date;
              if (index === 0) {
                addLog(`[Transform] TotalCalories (aggregated): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.startTime && record.energy?.inCalories != null) {
              // Raw record - convert from calories to kilocalories
              value = record.energy.inCalories / 1000;
              recordDate = record.startTime.split('T')[0];
              if (index === 0) {
                addLog(`[Transform] TotalCalories (raw): ${value} kcal on ${recordDate}`, 'debug');
              }
            } else if (record.energy?.inKilocalories != null) {
              // Already in kilocalories
              value = record.energy.inKilocalories;
              const dateField = record.startTime || record.time || record.date;
              recordDate = dateField ? dateField.split('T')[0] : null;
              if (index === 0 && recordDate) {
                addLog(`[Transform] TotalCalories (already in kcal): ${value} kcal on ${recordDate}`, 'debug');
              }
            }
          
            if (value == null || isNaN(value) || !recordDate) {
              if (index === 0) {
                addLog(`[Transform] TotalCalories FAILED: value=${value}, date=${recordDate}`, 'warn', 'WARNING');
              }
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
            if (index === 0) {
              console.log('[Transform BMR] Sample record:', JSON.stringify(record));
              addLog(`[Transform] BMR sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }
            
            let bmrValue = null;
            
            // THE FIX: Check for inKilocaloriesPerDay first
            if (record.basalMetabolicRate?.inKilocaloriesPerDay != null) {
              bmrValue = record.basalMetabolicRate.inKilocaloriesPerDay;
            } else if (record.basalMetabolicRate?.inCalories != null) {
              bmrValue = record.basalMetabolicRate.inCalories;
            } else if (record.basalMetabolicRate?.inKilocalories != null) {
              bmrValue = record.basalMetabolicRate.inKilocalories;
            } else if (typeof record.basalMetabolicRate === 'number') {
              bmrValue = record.basalMetabolicRate;
            } else if (record.bmr != null && typeof record.bmr === 'number') {
              bmrValue = record.bmr;
            } else if (record.value != null && typeof record.value === 'number') {
              bmrValue = record.value;
            }
            
            const bmrDate = record.time || record.startTime || record.timestamp || record.date;
            let bmrDateStr = null;
            
            if (bmrDate) {
              try {
                bmrDateStr = typeof bmrDate === 'string' ? bmrDate.split('T')[0] : bmrDate;
              } catch (e) {
                addLog(`[Transform] Error parsing BMR date: ${e.message}`, 'warn', 'WARNING');
              }
            }
            
            const isValidBMR = bmrValue != null && !isNaN(bmrValue) && bmrValue > 0 && bmrValue < 10000;
            const isValidBMRDate = bmrDateStr != null && bmrDateStr.length > 0;
            
            if (isValidBMR && isValidBMRDate) {
              value = bmrValue;
              recordDate = bmrDateStr;
              if (index === 0) {
                addLog(`[Transform] BMR SUCCESS: ${value} kcal on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidBMR) issues.push(`invalid value (${bmrValue})`);
                if (!isValidBMRDate) issues.push(`invalid date (${bmrDateStr})`);
                addLog(`[Transform] BMR FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
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
            if (index === 0) {
              console.log('[Transform O2Sat] Sample record:', JSON.stringify(record));
              addLog(`[Transform] O2Sat sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }
            
            let o2Value = null;
            
            if (record.percentage?.inPercent != null) {
              o2Value = record.percentage.inPercent;
            } else if (typeof record.percentage === 'number') {
              o2Value = record.percentage;
            } else if (record.value != null && typeof record.value === 'number') {
              o2Value = record.value;
            } else if (record.oxygenSaturation != null && typeof record.oxygenSaturation === 'number') {
              o2Value = record.oxygenSaturation;
            } else if (record.spo2 != null && typeof record.spo2 === 'number') {
              o2Value = record.spo2;
            }
            
            const o2Date = record.time || record.startTime || record.timestamp || record.date;
            let o2DateStr = null;
            
            if (o2Date) {
              try {
                o2DateStr = typeof o2Date === 'string' ? o2Date.split('T')[0] : o2Date;
              } catch (e) {
                addLog(`[Transform] Error parsing OxygenSaturation date: ${e.message}`, 'warn', 'WARNING');
              }
            }
            
            const isValidO2 = o2Value != null && !isNaN(o2Value) && o2Value > 0 && o2Value <= 100;
            const isValidO2Date = o2DateStr != null && o2DateStr.length > 0;
            
            if (isValidO2 && isValidO2Date) {
              value = o2Value;
              recordDate = o2DateStr;
              if (index === 0) {
                addLog(`[Transform] OxygenSaturation SUCCESS: ${value}% on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidO2) issues.push(`invalid value (${o2Value})`);
                if (!isValidO2Date) issues.push(`invalid date (${o2DateStr})`);
                addLog(`[Transform] OxygenSaturation FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
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
            if (index === 0) {
              console.log('[Transform Vo2Max] Sample record:', JSON.stringify(record));
              addLog(`[Transform] Vo2Max sample keys: ${Object.keys(record).join(', ')}`, 'debug');
            }
            
            let vo2Value = null;
            
            if (record.vo2Max != null && typeof record.vo2Max === 'number') {
              vo2Value = record.vo2Max;
            } else if (record.vo2 != null && typeof record.vo2 === 'number') {
              vo2Value = record.vo2;
            } else if (record.value != null && typeof record.value === 'number') {
              vo2Value = record.value;
            } else if (record.vo2MaxMillilitersPerMinuteKilogram != null) {
              vo2Value = record.vo2MaxMillilitersPerMinuteKilogram;
            }
            
            const vo2Date = record.time || record.startTime || record.timestamp || record.date;
            let vo2DateStr = null;
            
            if (vo2Date) {
              try {
                vo2DateStr = typeof vo2Date === 'string' ? vo2Date.split('T')[0] : vo2Date;
              } catch (e) {
                addLog(`[Transform] Error parsing Vo2Max date: ${e.message}`, 'warn', 'WARNING');
              }
            }
            
            const isValidVo2 = vo2Value != null && !isNaN(vo2Value) && vo2Value > 0 && vo2Value < 100;
            const isValidVo2Date = vo2DateStr != null && vo2DateStr.length > 0;
            
            if (isValidVo2 && isValidVo2Date) {
              value = vo2Value;
              recordDate = vo2DateStr;
              if (index === 0) {
                addLog(`[Transform] Vo2Max SUCCESS: ${value} ml/min/kg on ${recordDate}`, 'info', 'SUCCESS');
              }
            } else {
              if (index === 0) {
                const issues = [];
                if (!isValidVo2) issues.push(`invalid value (${vo2Value})`);
                if (!isValidVo2Date) issues.push(`invalid date (${vo2DateStr})`);
                addLog(`[Transform] Vo2Max FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
              }
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
      } else if (type === 'TotalCaloriesBurned') {
        dataToTransform = await aggregateTotalCaloriesByDate(rawRecords);
        addLog(`[HealthConnectService] Aggregated ${rawRecords.length} raw TotalCaloriesBurned records into ${dataToTransform.length} daily totals`);
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
