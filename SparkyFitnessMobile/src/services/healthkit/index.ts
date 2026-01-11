import {
  requestAuthorization,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  isHealthDataAvailable,
  queryCategorySamples,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { Platform, Alert } from 'react-native';
import { addLog } from '../LogService';
import {
  AggregatedHealthRecord,
  PermissionRequest,
} from '../../types/healthRecords';
import { SyncDuration } from './preferences';

// Track if HealthKit is available on this device
let isHealthKitAvailable = false;

// Define all supported HealthKit type identifiers for this app
const SUPPORTED_HK_TYPES = new Set<string>([
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
  'HKCategoryTypeIdentifierMindfulSession', // For Stress
  'HKWorkoutTypeIdentifier', // For Workouts
  'HKCategoryTypeIdentifierCervicalMucusQuality',
  'HKCategoryTypeIdentifierIntermenstrualBleeding',
  'HKCategoryTypeIdentifierMenstrualFlow',
  'HKCategoryTypeIdentifierOvulationTestResult',
  'HKQuantityTypeIdentifierBloodAlcoholContent',
  'HKQuantityTypeIdentifierPushCount',
  'HKQuantityTypeIdentifierBasalBodyTemperature',
  'HKQuantityTypeIdentifierCyclingCadence',
  'HKQuantityTypeIdentifierDietaryFatTotal',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietarySodium',
  'HKQuantityTypeIdentifierWalkingSpeed',
  'HKQuantityTypeIdentifierWalkingStepLength',
  'HKQuantityTypeIdentifierWalkingAsymmetryPercentage',
  'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage',
  'HKQuantityTypeIdentifierRunningGroundContactTime',
  'HKQuantityTypeIdentifierRunningStrideLength',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierRunningVerticalOscillation',
  'HKQuantityTypeIdentifierRunningSpeed',
  'HKQuantityTypeIdentifierCyclingSpeed',
  'HKQuantityTypeIdentifierCyclingPower',
  'HKQuantityTypeIdentifierCyclingFunctionalThresholdPower',
  'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
  'HKQuantityTypeIdentifierHeadphoneAudioExposure',
  'HKQuantityTypeIdentifierAppleMoveTime',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierAppleStandTime',
]);

// Map record types to the unit we want HealthKit to return values in.
// Without specifying a unit, HealthKit returns values in the user's preferred/locale unit,
// which can cause issues if we assume a specific unit (e.g., kg vs lbs).
const HEALTHKIT_UNIT_MAP: Record<string, string> = {
  'Weight': 'kg',
  'Height': 'm',
  'LeanBodyMass': 'kg',
  'Distance': 'm',
  'Hydration': 'L',
  'BodyTemperature': 'degC',
  'BasalBodyTemperature': 'degC',
  'BloodGlucose': 'mmol/L',
  // Add other metrics that need explicit units as needed
};

// Map our internal health metric types to the official HealthKit identifiers
const HEALTHKIT_TYPE_MAP: Record<string, string> = {
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
  'Stress': 'HKCategoryTypeIdentifierMindfulSession', // Map Stress to MindfulSession for HealthKit
  'Workout': 'HKWorkoutTypeIdentifier', // Map Workout to HKWorkoutTypeIdentifier for HealthKit
  'CervicalMucus': 'HKCategoryTypeIdentifierCervicalMucusQuality',
  'ExerciseRoute': 'HKWorkoutTypeIdentifier',
  'IntermenstrualBleeding': 'HKCategoryTypeIdentifierIntermenstrualBleeding',
  'MenstruationFlow': 'HKCategoryTypeIdentifierMenstrualFlow',
  'OvulationTest': 'HKCategoryTypeIdentifierOvulationTestResult',
  'BloodAlcoholContent': 'HKQuantityTypeIdentifierBloodAlcoholContent',
  'BloodOxygenSaturation': 'HKQuantityTypeIdentifierOxygenSaturation',
  'BasalBodyTemperature': 'HKQuantityTypeIdentifierBasalBodyTemperature',
  'BasalMetabolicRate': 'HKQuantityTypeIdentifierBasalEnergyBurned',
  'ExerciseSession': 'HKWorkoutTypeIdentifier',
  'CyclingCadence': 'HKQuantityTypeIdentifierCyclingCadence',
  'DietaryFatTotal': 'HKQuantityTypeIdentifierDietaryFatTotal',
  'DietaryProtein': 'HKQuantityTypeIdentifierDietaryProtein',
  'DietarySodium': 'HKQuantityTypeIdentifierDietarySodium',
  'WalkingSpeed': 'HKQuantityTypeIdentifierWalkingSpeed',
  'WalkingStepLength': 'HKQuantityTypeIdentifierWalkingStepLength',
  'WalkingAsymmetryPercentage': 'HKQuantityTypeIdentifierWalkingAsymmetryPercentage',
  'WalkingDoubleSupportPercentage': 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage',
  'RunningGroundContactTime': 'HKQuantityTypeIdentifierRunningGroundContactTime',
  'RunningStrideLength': 'HKQuantityTypeIdentifierRunningStrideLength',
  'RunningPower': 'HKQuantityTypeIdentifierRunningPower',
  'RunningVerticalOscillation': 'HKQuantityTypeIdentifierRunningVerticalOscillation',
  'RunningSpeed': 'HKQuantityTypeIdentifierRunningSpeed',
  'CyclingSpeed': 'HKQuantityTypeIdentifierCyclingSpeed',
  'CyclingPower': 'HKQuantityTypeIdentifierCyclingPower',
  'CyclingFunctionalThresholdPower': 'HKQuantityTypeIdentifierCyclingFunctionalThresholdPower',
  'EnvironmentalAudioExposure': 'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
  'HeadphoneAudioExposure': 'HKQuantityTypeIdentifierHeadphoneAudioExposure',
  'AppleMoveTime': 'HKQuantityTypeIdentifierAppleMoveTime',
  'AppleExerciseTime': 'HKQuantityTypeIdentifierAppleExerciseTime',
  'AppleStandTime': 'HKQuantityTypeIdentifierAppleStandTime',
};


// Alias for cross-platform compatibility - Android uses initHealthConnect
export const initHealthConnect = async (): Promise<boolean> => {
  try {
    isHealthKitAvailable = await isHealthDataAvailable();
    return isHealthKitAvailable;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to check HealthKit availability: ${message}`, 'error', 'ERROR');
    isHealthKitAvailable = false;
    return false;
  }
};

export const requestHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<boolean> => {
  if (!isHealthKitAvailable) {
    Alert.alert(
      'Health App Not Available',
      'Please install the Apple Health app to sync your health data.'
    );
    return false;
  }

  const isSimulator = Platform.OS === 'ios' && (Platform.constants as { simulator?: boolean })?.simulator === true;
  if (isSimulator && !global?.FORCE_HEALTHKIT_ON_SIM) {
    return true;
  }

  if (!permissionsToRequest || permissionsToRequest.length === 0) {
    return true;
  }

  const readPermissionsSet = new Set<string>();
  const writePermissionsSet = new Set<string>();

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
      } else if (p.recordType === 'Workout') {
        if (p.accessType === 'read') {
          readPermissionsSet.add('HKWorkoutTypeIdentifier');
        } else if (p.accessType === 'write') {
          writePermissionsSet.add('HKWorkoutTypeIdentifier');
        }
      }
      else if (SUPPORTED_HK_TYPES.has(healthkitIdentifier)) {
        if (p.accessType === 'read') {
          readPermissionsSet.add(healthkitIdentifier);
        } else if (p.accessType === 'write') {
          writePermissionsSet.add(healthkitIdentifier);
        }
      }
    }
  });

  const toRead = Array.from(readPermissionsSet);
  const toShare = Array.from(writePermissionsSet);

  if (toRead.length === 0 && toShare.length === 0) {
    return true;
  }

  try {
    // HealthKit library expects 'toRead' and 'toShare' arrays
    await requestAuthorization({
      toRead: toRead as Parameters<typeof requestAuthorization>[0]['toRead'],
      toShare: toShare as Parameters<typeof requestAuthorization>[0]['toShare'],
    });

    return true;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to request permissions: ${message}`, 'error', 'ERROR');
    Alert.alert(
      'Permission Error',
      `An unexpected error occurred while trying to request Health permissions: ${message}`
    );
    return false;
  }
};

export const getSyncStartDate = (duration: SyncDuration): Date => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
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

// Configuration for aggregated health metrics
interface AggregationConfig {
  identifier: string;
  unit: string;
  type: string;
  logLabel: string;
}

const AGGREGATION_CONFIGS: Record<string, AggregationConfig> = {
  steps: {
    identifier: 'HKQuantityTypeIdentifierStepCount',
    unit: 'count',
    type: 'step',
    logLabel: 'steps',
  },
  activeCalories: {
    identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    unit: 'kcal',
    type: 'active_calories',
    logLabel: 'calories',
  },
  distance: {
    identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    unit: 'm',
    type: 'distance',
    logLabel: 'distance',
  },
  floorsClimbed: {
    identifier: 'HKQuantityTypeIdentifierFlightsClimbed',
    unit: 'count',
    type: 'floors_climbed',
    logLabel: 'floors',
  },
};

// Generic aggregation function for cumulative HealthKit metrics
// Uses HealthKit's statistics query which handles deduplication automatically
const getAggregatedDataByDate = async (
  startDate: Date,
  endDate: Date,
  config: AggregationConfig
): Promise<AggregatedHealthRecord[]> => {
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available for ${config.logLabel} aggregation`, 'debug');
    return [];
  }

  const results: AggregatedHealthRecord[] = [];
  const currentDate = new Date(startDate);
  let daysQueried = 0;
  let daysWithData = 0;

  while (currentDate <= endDate) {
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Don't query future dates
    const now = new Date();
    if (dayEnd > now) {
      dayEnd.setTime(now.getTime());
    }

    daysQueried++;
    try {
      const stats = await queryStatisticsForQuantity(
        config.identifier as Parameters<typeof queryStatisticsForQuantity>[0],
        ['cumulativeSum'],
        {
          filter: {
            date: {
              startDate: dayStart,
              endDate: dayEnd,
            },
          },
          unit: config.unit,
        }
      );

      if (stats && stats.sumQuantity && stats.sumQuantity.quantity > 0) {
        daysWithData++;
        const dateStr = dayStart.toISOString().split('T')[0];
        results.push({
          date: dateStr,
          value: Math.round(stats.sumQuantity.quantity),
          type: config.type,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Failed to get aggregated ${config.logLabel}: ${message}`, 'error', 'ERROR');
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (daysWithData === 0) {
    addLog(`[HealthKitService] No ${config.logLabel} data found for ${daysQueried} days queried`, 'debug');
  } else {
    addLog(`[HealthKitService] ${config.logLabel} aggregation: ${daysWithData}/${daysQueried} days with data`, 'debug');
  }

  return results;
};

export const getAggregatedStepsByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.steps);

export const getAggregatedActiveCaloriesByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.activeCalories);

export const getAggregatedTotalCaloriesByDate = async (
  startDate: Date,
  endDate: Date
): Promise<AggregatedHealthRecord[]> => {
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available for total calories aggregation`, 'debug');
    return [];
  }

  const results: AggregatedHealthRecord[] = [];
  const currentDate = new Date(startDate);
  let daysQueried = 0;
  let daysWithData = 0;
  let errorCount = 0;

  while (currentDate <= endDate) {
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const now = new Date();
    if (dayEnd > now) {
      dayEnd.setTime(now.getTime());
    }

    daysQueried++;
    try {
      // Query both basal and active with full precision, then sum
      const [basalStats, activeStats] = await Promise.all([
        queryStatisticsForQuantity(
          'HKQuantityTypeIdentifierBasalEnergyBurned',
          ['cumulativeSum'],
          { filter: { date: { startDate: dayStart, endDate: dayEnd } }, unit: 'kcal' }
        ),
        queryStatisticsForQuantity(
          'HKQuantityTypeIdentifierActiveEnergyBurned',
          ['cumulativeSum'],
          { filter: { date: { startDate: dayStart, endDate: dayEnd } }, unit: 'kcal' }
        ),
      ]);

      const basal = basalStats?.sumQuantity?.quantity || 0;
      const active = activeStats?.sumQuantity?.quantity || 0;

      if (basal > 0 || active > 0) {
        daysWithData++;
        const dateStr = dayStart.toISOString().split('T')[0];
        const total = Math.round(basal + active);
        results.push({
          date: dateStr,
          value: total,
          type: 'total_calories',
        });
      }
    } catch (error) {
      errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Failed to get aggregated total calories: ${message}`, 'error', 'ERROR');
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (daysWithData === 0) {
    addLog(`[HealthKitService] No total calories data found for ${daysQueried} days queried${errorCount > 0 ? `, ${errorCount} errors` : ''}`, 'debug');
  } else {
    addLog(`[HealthKitService] Total calories aggregation: ${daysWithData}/${daysQueried} days with data${errorCount > 0 ? `, ${errorCount} errors` : ''}`, 'debug');
  }

  return results;
};

export const getAggregatedDistanceByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.distance);

export const getAggregatedFloorsClimbedByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.floorsClimbed);

// Read health records from HealthKit
export const readHealthRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> => {
  if (!isHealthKitAvailable) {
    return [];
  }

  const queryLimit = 20000; // Define a reasonable limit for HealthKit queries

  try {
    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    if (!identifier) {
      return [];
    }

    // Handle special cases first
    if (recordType === 'SleepSession') {
      const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
        ascending: false,
        limit: queryLimit,
      });
      const filteredSamples = samples.filter(s => {
        const recordStartDate = new Date(s.startDate);
        const recordEndDate = new Date(s.endDate);
        return recordStartDate >= startDate && recordEndDate <= endDate;
      });

      // Map to standard format expected by consumers (MainScreen, etc.)
      return filteredSamples.map(s => ({
        startTime: s.startDate,
        endTime: s.endDate,
        value: s.value, // 'ASLEEP', 'INBED', etc. value is often an enum in HK
        metadata: (s as unknown as { metadata?: unknown }).metadata,
        sourceName: (s as unknown as { sourceName?: string }).sourceName,
        sourceId: (s as unknown as { sourceId?: string }).sourceId,
      }));
    }

    if (recordType === 'Stress') {
      const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
        ascending: false,
        limit: queryLimit,
      });
      // Filter samples manually by date range
      const filteredSamples = samples.filter(s => {
        const recordStartDate = new Date(s.startDate);
        return recordStartDate >= startDate && recordStartDate <= endDate;
      });
      return filteredSamples.map(s => ({
        startTime: s.startDate,
        endTime: s.endDate,
        value: 1, // MindfulSession doesn't have a direct stress level, so we'll just record its presence
      }));
    }

    if (recordType === 'Workout' || recordType === 'ExerciseSession') {
      // Filter uses nested date object with Date objects (not ISO strings)
      const workouts = await queryWorkoutSamples({
        ascending: false,
        limit: queryLimit,
      });

      // Filter workouts by date range manually
      const filteredWorkouts = workouts.filter(w => {
        const workoutStart = new Date(w.startDate);
        const workoutEnd = new Date(w.endDate);
        return workoutStart >= startDate && workoutEnd <= endDate;
      });

      // Fetch statistics (calories, distance) for each workout
      const workoutsWithStats = await Promise.all(filteredWorkouts.map(async (w) => {
        // Cast workout to access potential direct properties (may exist on older workouts)
        const workoutAny = w as unknown as {
          totalEnergyBurned?: number | { inKilocalories?: number };
          totalDistance?: number | { inMeters?: number };
        };

        // Start with direct properties from workout sample (fallback for older workouts)
        let totalEnergyBurned = typeof workoutAny.totalEnergyBurned === 'object'
          ? (workoutAny.totalEnergyBurned?.inKilocalories ?? 0)
          : (workoutAny.totalEnergyBurned ?? 0);
        let totalDistance = typeof workoutAny.totalDistance === 'object'
          ? (workoutAny.totalDistance?.inMeters ?? 0)
          : (workoutAny.totalDistance ?? 0);

        try {
          const stats = await w.getAllStatistics();

          // Active energy burned (calories) - prefer stats if available
          const energyStats = stats['HKQuantityTypeIdentifierActiveEnergyBurned'];
          if (energyStats?.sumQuantity?.quantity) {
            totalEnergyBurned = energyStats.sumQuantity.quantity;
          }

          // Distance - check multiple types based on workout activity
          const distanceTypes = [
            'HKQuantityTypeIdentifierDistanceWalkingRunning',
            'HKQuantityTypeIdentifierDistanceCycling',
            'HKQuantityTypeIdentifierDistanceSwimming',
            'HKQuantityTypeIdentifierDistanceWheelchair',
            'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
          ];
          for (const distanceType of distanceTypes) {
            const distanceStats = stats[distanceType];
            if (distanceStats?.sumQuantity?.quantity) {
              totalDistance = distanceStats.sumQuantity.quantity;
              break; // Use first available distance type
            }
          }
        } catch {
          // Stats fetch failed - keep using direct properties from workout
        }

        return {
          startTime: w.startDate,
          endTime: w.endDate,
          activityType: w.workoutActivityType,
          duration: w.duration,
          totalEnergyBurned,
          totalDistance,
        };
      }));

      return workoutsWithStats;
    }

    if (recordType === 'BloodPressure') {
      const systolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', {
        ascending: false,
        limit: queryLimit,
      });
      const diastolicSamples = await queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', {
        ascending: false,
        limit: queryLimit,
      });

      // Filter by date range manually
      const filteredSystolic = systolicSamples.filter(s => {
        const sampleDate = new Date(s.startDate);
        return sampleDate >= startDate && sampleDate <= endDate;
      });
      const filteredDiastolic = diastolicSamples.filter(s => {
        const sampleDate = new Date(s.startDate);
        return sampleDate >= startDate && sampleDate <= endDate;
      });

      const bpMap = new Map<string, { systolic?: number; diastolic?: number; time: string }>();
      filteredSystolic.forEach(s => {
        const timeStr = typeof s.startDate === 'string' ? s.startDate : new Date(s.startDate).toISOString();
        bpMap.set(timeStr, { systolic: s.quantity, time: timeStr });
      });
      filteredDiastolic.forEach(s => {
        const timeStr = typeof s.startDate === 'string' ? s.startDate : new Date(s.startDate).toISOString();
        const existing = bpMap.get(timeStr);
        if (existing) existing.diastolic = s.quantity;
      });

      const results = Array.from(bpMap.values())
        .filter(r => r.systolic && r.diastolic) // Ensure both values exist
        .map(r => ({
          systolic: { inMillimetersOfMercury: r.systolic },
          diastolic: { inMillimetersOfMercury: r.diastolic },
          time: r.time,
        }));

      return results;
    }

    // Handle all other standard quantity types
    if (!SUPPORTED_HK_TYPES.has(identifier)) {
      return [];
    }

    // Get the expected unit for this record type (if any)
    const unit = HEALTHKIT_UNIT_MAP[recordType];
    const queryOptions: { ascending: boolean; limit: number; unit?: string } = {
      ascending: false,
      limit: queryLimit,
    };
    if (unit) {
      queryOptions.unit = unit;
    }

    const samples = await queryQuantitySamples(identifier as Parameters<typeof queryQuantitySamples>[0], queryOptions);

    // Defensive check: Ensure samples is an array before proceeding
    if (!Array.isArray(samples)) {
      return [];
    }

    // Manual filtering for iOS as a workaround for potential library issues where the native
    // query may not respect the date range, returning all historical data.
    const filteredSamples = samples.filter(record => {
      const recordDate = new Date(record.startDate);
      return recordDate >= startDate && recordDate <= endDate;
    });

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
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Error reading ${recordType}: ${message}`, 'error', 'ERROR');
    return [];
  }
};
