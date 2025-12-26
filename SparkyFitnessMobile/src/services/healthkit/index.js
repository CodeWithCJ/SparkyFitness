import {
  requestAuthorization,
  queryQuantitySamples,
  isHealthDataAvailable,
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import { Platform, Alert } from 'react-native';
import { addLog } from '../LogService';
import { HEALTH_METRICS } from '../../constants/HealthMetrics';

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

  const queryLimit = 20000; // Define a reasonable limit for HealthKit queries

  try {
    //addLog(`[HealthKitService] Reading ${recordType} records from ${startDate.toISOString()} to ${endDate.toISOString()} (requested range)`);

    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    if (!identifier) {
      addLog(`[HealthKitService] Unsupported record type: ${recordType}`, 'warn', 'WARNING');
      return [];
    }

    // Handle special cases first
    if (recordType === 'SleepSession') {
      console.log(`[HealthKitService DEBUG] Calling queryCategorySamples for SleepSession with from: ${startDate.toISOString()}, to: ${endDate.toISOString()} and limit: ${queryLimit}`);
      const samples = await queryCategorySamples(identifier, { from: startDate, to: endDate, limit: queryLimit });
      //addLog(`[HealthKitService] Raw samples (Sleep) returned by native query: Count = ${samples.length}, First 5: ${JSON.stringify(samples.slice(0, 5))}`);
      //addLog(`[HealthKitService] Read ${samples.length} Sleep records`);
      return samples.map(s => ({
        startTime: s.startDate,
        endTime: s.endDate,
      }));
    }

    if (recordType === 'BloodPressure') {
      //console.log(`[HealthKitService DEBUG] Calling queryQuantitySamples for BloodPressureSystolic with from: ${startDate.toISOString()}, to: ${endDate.toISOString()} and limit: ${queryLimit}`);
      const systolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', { from: startDate, to: endDate, limit: queryLimit });
      console.log(`[HealthKitService DEBUG] Calling queryQuantitySamples for BloodPressureDiastolic with from: ${startDate.toISOString()}, to: ${endDate.toISOString()} and limit: ${queryLimit}`);
      const diastolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', { from: startDate, to: endDate, limit: queryLimit });
      //addLog(`[HealthKitService] Raw systolic samples (BloodPressure) returned by native query: Count = ${systolicSamples.length}, First 5: ${JSON.stringify(systolicSamples.slice(0, 5))}`);
      //addLog(`[HealthKitService] Raw diastolic samples (BloodPressure) returned by native query: Count = ${diastolicSamples.length}, First 5: ${JSON.stringify(diastolicSamples.slice(0, 5))}`);

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

    console.log(`[HealthKitService DEBUG] Calling queryQuantitySamples for ${recordType} with from: ${startDate.toISOString()}, to: ${endDate.toISOString()} and limit: ${queryLimit}`);
    const samples = await queryQuantitySamples(identifier, { from: startDate, to: endDate, limit: queryLimit });

    // Defensive check: Ensure samples is an array before proceeding
    if (!Array.isArray(samples)) {
      addLog(`[HealthKitService] queryQuantitySamples for ${recordType} returned non-array data: ${JSON.stringify(samples)}. Expected an array.`, 'warn', 'WARNING');
      return [];
    }

    // Log the raw samples to understand what's being returned
    //addLog(`[HealthKitService] Raw samples for ${recordType}: ${JSON.stringify(samples)}`);
    //addLog(`[HealthKitService] Read ${samples.length} ${recordType} records, applying manual filter for iOS.`);

    // Manual filtering for iOS as a workaround for potential library issues where the native
    // query may not respect the date range, returning all historical data.
    const filteredSamples = samples.filter((record, index) => {
      const recordDate = new Date(record.startDate || record.time);
      const isWithinRange = recordDate >= startDate && recordDate <= endDate;
      if (index < 10 || !isWithinRange) { // Log first 10 records and any out-of-range records
        //addLog(`[HealthKitService] Filter check for ${recordType} - Record Date: ${recordDate.toISOString()}, Start Date: ${startDate.toISOString()}, End Date: ${endDate.toISOString()}, Within Range: ${isWithinRange}`);
      }
      return isWithinRange;
    });

    if (samples.length > filteredSamples.length) {
      addLog(`[HealthKitService] Manual filter was necessary. Raw count: ${samples.length}, Filtered count: ${filteredSamples.length} for ${recordType}.`, 'warn', 'WARNING');
    } else {
      addLog(`[HealthKitService] Found ${filteredSamples.length} ${recordType} records after manual filtering for iOS.`);
    }

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

export const syncHealthData = async (syncDuration, healthMetricStates = {}, api) => {
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
