// Lazy load react-native-health to avoid crashes during module initialization
// Use dynamic require with error handling instead of static import
let AppleHealthKit = null;
let healthKitLoadError = null;

try {
  AppleHealthKit = require('react-native-health').default || require('react-native-health');
  console.log('[HealthKitService] Successfully loaded react-native-health module');
} catch (error) {
  console.warn('[HealthKitService] Failed to load react-native-health:', error);
  healthKitLoadError = error;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import * as api from './api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';

const SYNC_DURATION_KEY = '@HealthKit:syncDuration';

// Track if HealthKit is available on this device
let isHealthKitAvailable = false;

// HealthKit permissions - built dynamically to avoid crashes from missing constants
const getHealthKitPermissions = () => {
  try {
    // If HealthKit module didn't load, return empty permissions
    if (!AppleHealthKit || healthKitLoadError) {
      console.warn('[HealthKitService] Cannot build permissions - module not loaded');
      return {
        permissions: {
          read: [],
          write: [],
        },
      };
    }

    const permissions = [];

    // List of permissions to request - only add if they exist
    const permissionNames = [
      'StepCount',
      'HeartRate',
      'ActiveEnergyBurned',
      'BasalEnergyBurned',
      'Weight',
      'Height',
      'BodyFatPercentage',
      'BloodPressureSystolic',
      'BloodPressureDiastolic',
      'SleepAnalysis',
      'DistanceWalkingRunning',
      'FlightsClimbed',
      'Water',
      'RestingHeartRate',
      'OxygenSaturation',
      'Vo2Max',
      'BloodGlucose',
      'BodyTemperature',
      'LeanBodyMass',
      'RespiratoryRate',
      'Workout',
    ];

    permissionNames.forEach(permName => {
      try {
        if (AppleHealthKit?.Constants?.Permissions?.[permName]) {
          permissions.push(AppleHealthKit.Constants.Permissions[permName]);
        }
      } catch (err) {
        // Skip permissions that don't exist
        console.warn(`[HealthKit] Skipping unavailable permission: ${permName}`);
      }
    });

    addLog(`[HealthKitService] Built permission list with ${permissions.length} permissions`);

    return {
      permissions: {
        read: permissions,
        write: [],
      },
    };
  } catch (error) {
    addLog(`[HealthKitService] Error building permissions: ${error.message}`, 'error', 'ERROR');
    return {
      permissions: {
        read: [],
        write: [],
      },
    };
  }
};

export const initHealthKit = async () => {
  return new Promise((resolve, reject) => {
    try {
      // Check if the module loaded successfully
      if (!AppleHealthKit || healthKitLoadError) {
        addLog(`[HealthKitService] HealthKit module failed to load: ${healthKitLoadError?.message || 'Module not available'}`, 'error', 'ERROR');
        console.error('[HealthKitService] HealthKit module not loaded', healthKitLoadError);
        isHealthKitAvailable = false;
        resolve(false);
        return;
      }

      // Check if HealthKit is available on this device
      AppleHealthKit.isAvailable((err, available) => {
        if (err) {
          addLog(`[HealthKitService] Error checking HealthKit availability: ${err}`, 'warn', 'WARNING');
          console.warn('[HealthKitService] HealthKit not available on this device', err);
          resolve(false);
          return;
        }

        if (!available) {
          addLog('[HealthKitService] HealthKit is not available on this device (likely iPad without full support)', 'warn', 'WARNING');
          console.warn('[HealthKitService] HealthKit not available');
          resolve(false);
          return;
        }

        // HealthKit is available, proceed with initialization
        try {
          const permissions = getHealthKitPermissions();
          AppleHealthKit.initHealthKit(permissions, (err, results) => {
            if (err) {
              addLog(`[HealthKitService] Failed to initialize HealthKit: ${err}`, 'error', 'ERROR');
              console.error('[HealthKitService] Failed to initialize HealthKit', err);
              isHealthKitAvailable = false;
              resolve(false);
            } else {
              addLog('[HealthKitService] HealthKit initialized successfully', 'info', 'SUCCESS');
              isHealthKitAvailable = true;
              resolve(true);
            }
          });
        } catch (initError) {
          addLog(`[HealthKitService] Exception during HealthKit initialization: ${initError.message}`, 'error', 'ERROR');
          console.error('[HealthKitService] HealthKit initialization exception', initError);
          resolve(false);
        }
      });
    } catch (error) {
      addLog(`[HealthKitService] Exception checking HealthKit availability: ${error.message}`, 'error', 'ERROR');
      console.error('[HealthKitService] HealthKit availability check failed', error);
      resolve(false);
    }
  });
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

  return new Promise((resolve, reject) => {
    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    addLog(`[HealthKitService] Reading ${recordType} records from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    switch (recordType) {
      case 'Steps':
        AppleHealthKit.getDailyStepCountSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Steps: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Steps records`);
            resolve(results.map(r => ({ value: r.value, startTime: r.startDate, endTime: r.endDate })));
          }
        });
        break;

      case 'ActiveCaloriesBurned':
        AppleHealthKit.getActiveEnergyBurned(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading ActiveCalories: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} ActiveCalories records`);
            resolve(results.map(r => ({
              energy: { inCalories: r.value },
              startTime: r.startDate,
              endTime: r.endDate
            })));
          }
        });
        break;

      case 'TotalCaloriesBurned':
        AppleHealthKit.getBasalEnergyBurned(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BasalEnergy: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BasalEnergy records`);
            resolve(results.map(r => ({
              energy: { inCalories: r.value },
              startTime: r.startDate,
              endTime: r.endDate
            })));
          }
        });
        break;

      case 'HeartRate':
        AppleHealthKit.getHeartRateSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading HeartRate: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} HeartRate records`);
            resolve(results.map(r => ({
              samples: [{ beatsPerMinute: r.value }],
              startTime: r.startDate
            })));
          }
        });
        break;

      case 'Weight':
        AppleHealthKit.getWeightSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Weight: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Weight records`);
            resolve(results.map(r => ({
              weight: { inKilograms: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'BloodPressure':
        AppleHealthKit.getBloodPressureSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BloodPressure: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BloodPressure records`);
            resolve(results.map(r => ({
              systolic: { inMillimetersOfMercury: r.bloodPressureSystolicValue },
              diastolic: { inMillimetersOfMercury: r.bloodPressureDiastolicValue },
              time: r.startDate
            })));
          }
        });
        break;

      case 'BodyFat':
        AppleHealthKit.getBodyFatPercentageSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BodyFat: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BodyFat records`);
            resolve(results.map(r => ({
              percentage: { inPercent: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'BodyTemperature':
        AppleHealthKit.getBodyTemperatureSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BodyTemperature: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BodyTemperature records`);
            resolve(results.map(r => ({
              temperature: { inCelsius: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'BloodGlucose':
        AppleHealthKit.getBloodGlucoseSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BloodGlucose: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BloodGlucose records`);
            resolve(results.map(r => ({
              level: { inMillimolesPerLiter: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'Height':
        AppleHealthKit.getHeightSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Height: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Height records`);
            resolve(results.map(r => ({
              height: { inMeters: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'SleepSession':
        AppleHealthKit.getSleepSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Sleep: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Sleep records`);
            resolve(results.map(r => ({
              startTime: r.startDate,
              endTime: r.endDate
            })));
          }
        });
        break;

      case 'OxygenSaturation':
        AppleHealthKit.getOxygenSaturationSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading OxygenSaturation: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} OxygenSaturation records`);
            resolve(results.map(r => ({
              percentage: { inPercent: r.value * 100 },
              time: r.startDate
            })));
          }
        });
        break;

      case 'Vo2Max':
        AppleHealthKit.getVo2MaxSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Vo2Max: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Vo2Max records`);
            resolve(results.map(r => ({
              vo2Max: r.value,
              time: r.startDate
            })));
          }
        });
        break;

      case 'RestingHeartRate':
        AppleHealthKit.getRestingHeartRateSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading RestingHeartRate: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} RestingHeartRate records`);
            resolve(results.map(r => ({
              beatsPerMinute: r.value,
              time: r.startDate
            })));
          }
        });
        break;

      case 'RespiratoryRate':
        AppleHealthKit.getRespiratoryRateSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading RespiratoryRate: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} RespiratoryRate records`);
            resolve(results.map(r => ({
              rate: r.value,
              time: r.startDate
            })));
          }
        });
        break;

      case 'Distance':
        AppleHealthKit.getDistanceWalkingRunning(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Distance: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Distance records`);
            resolve(results.map(r => ({
              distance: { inMeters: r.value },
              startTime: r.startDate
            })));
          }
        });
        break;

      case 'FloorsClimbed':
        AppleHealthKit.getFlightsClimbed(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading FloorsClimbed: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} FloorsClimbed records`);
            resolve(results.map(r => ({
              floors: r.value,
              startTime: r.startDate
            })));
          }
        });
        break;

      case 'Hydration':
        AppleHealthKit.getWaterSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading Hydration: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} Hydration records`);
            resolve(results.map(r => ({
              volume: { inLiters: r.value },
              startTime: r.startDate
            })));
          }
        });
        break;

      case 'LeanBodyMass':
        AppleHealthKit.getLeanBodyMassSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading LeanBodyMass: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} LeanBodyMass records`);
            resolve(results.map(r => ({
              mass: { inKilograms: r.value },
              time: r.startDate
            })));
          }
        });
        break;

      case 'ExerciseSession':
        AppleHealthKit.getWorkoutSamples(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading ExerciseSession: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} ExerciseSession records`);
            resolve(results.map(r => ({
              startTime: r.start,
              endTime: r.end
            })));
          }
        });
        break;

      case 'BasalMetabolicRate':
        AppleHealthKit.getBasalEnergyBurned(options, (err, results) => {
          if (err) {
            addLog(`[HealthKitService] Error reading BMR: ${err}`, 'error', 'ERROR');
            resolve([]);
          } else {
            addLog(`[HealthKitService] Read ${results.length} BMR records`);
            // Estimate BMR from basal energy
            if (results.length > 0) {
              const dailyBMR = results.reduce((sum, r) => sum + r.value, 0) / results.length;
              resolve([{
                basalMetabolicRate: { inKilocaloriesPerDay: dailyBMR },
                time: results[0].startDate
              }]);
            } else {
              resolve([]);
            }
          }
        });
        break;

      default:
        addLog(`[HealthKitService] Unsupported record type: ${recordType}`, 'warn', 'WARNING');
        resolve([]);
        break;
    }
  });
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
