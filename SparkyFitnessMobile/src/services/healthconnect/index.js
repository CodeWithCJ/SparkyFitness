import {
  initialize,
  requestPermission,
  readRecords,
  HeartRateRecord,
  WeightRecord,
  BloodPressureRecord,
  NutritionRecord,
  SleepSessionRecord,
  StressRecord,
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
  WorkoutRecord,
  CyclingPedalingCadenceRecord,
  ExerciseRouteRecord,
  IntermenstrualBleedingRecord,
  MenstruationPeriodRecord,
  StepsCadenceRecord,
  BloodAlcoholContentRecord,
  BloodOxygenSaturationRecord,
  DietaryFatTotalRecord,
  DietaryProteinRecord,
  DietarySodiumRecord,
  WalkingSpeedRecord,
  WalkingStepLengthRecord,
  WalkingAsymmetryPercentageRecord,
  WalkingDoubleSupportPercentageRecord,
  RunningGroundContactTimeRecord,
  RunningStrideLengthRecord,
  RunningPowerRecord,
  RunningVerticalOscillationRecord,
  RunningSpeedRecord,
  CyclingSpeedRecord,
  CyclingPowerRecord,
  CyclingCadenceRecord,
  CyclingFunctionalThresholdPowerRecord,
  EnvironmentalAudioExposureRecord,
  HeadphoneAudioExposureRecord,
  AppleMoveTimeRecord,
  AppleExerciseTimeRecord,
  AppleStandTimeRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { HEALTH_METRICS } from '../../constants/HealthMetrics';

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

export const getSyncStartDate = (duration) => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 2);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 6);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 29);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 89);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
  return startDate;
};

export const syncHealthData = async (syncDuration, healthMetricStates = {}, api) => {
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
