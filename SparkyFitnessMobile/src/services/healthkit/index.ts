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
import { getSyncStartDate } from '../../utils/syncUtils';
import { toLocalDateString } from './dataAggregation';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };

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
  'BloodGlucose': 'mg/dL',
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
    addLog(`[HealthKitService] Failed to check HealthKit availability: ${message}`, 'ERROR');
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
    addLog(`[HealthKitService] Failed to request permissions: ${message}`, 'ERROR');
    Alert.alert(
      'Permission Error',
      `An unexpected error occurred while trying to request Health permissions: ${message}`
    );
    return false;
  }
};

// Result from a custom query function for aggregation
interface AggregationQueryResult {
  value: number;
  hasData: boolean;
}

// Configuration for aggregated health metrics
interface AggregationConfig {
  identifier: string;
  unit: string;
  type: string;
  logLabel: string;
  // Optional custom query function for metrics that need special handling (e.g., multi-query metrics)
  // If provided, this is used instead of the default single-query approach
  queryFn?: (dayStart: Date, dayEnd: Date) => Promise<AggregationQueryResult | null>;
}

// Query function for total calories (basal + active)
const queryTotalCalories = async (
  dayStart: Date,
  dayEnd: Date
): Promise<AggregationQueryResult | null> => {
  try {
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
      return { value: Math.round(basal + active), hasData: true };
    }
    return { value: 0, hasData: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to query total calories: ${message}`, 'ERROR');
    return null;
  }
};

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
  totalCalories: {
    identifier: '', // Not used - custom queryFn handles both metrics
    unit: 'kcal',
    type: 'total_calories',
    logLabel: 'total calories',
    queryFn: queryTotalCalories,
  },
};

// Default query function for single-metric aggregation using HealthKit statistics
const defaultAggregationQuery = async (
  dayStart: Date,
  dayEnd: Date,
  identifier: string,
  unit: string
): Promise<AggregationQueryResult | null> => {
  const stats = await queryStatisticsForQuantity(
    identifier as Parameters<typeof queryStatisticsForQuantity>[0],
    ['cumulativeSum'],
    {
      filter: {
        date: {
          startDate: dayStart,
          endDate: dayEnd,
        },
      },
      unit,
    }
  );

  if (stats && stats.sumQuantity && stats.sumQuantity.quantity > 0) {
    return { value: Math.round(stats.sumQuantity.quantity), hasData: true };
  }
  return { value: 0, hasData: false };
};

// Generic aggregation function for cumulative HealthKit metrics
// Uses HealthKit's statistics query which handles deduplication automatically
// Supports custom query functions for metrics that need special handling (e.g., total calories)
const getAggregatedDataByDate = async (
  startDate: Date,
  endDate: Date,
  config: AggregationConfig
): Promise<AggregatedHealthRecord[]> => {
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available for ${config.logLabel} aggregation`, 'DEBUG');
    return [];
  }

  const results: AggregatedHealthRecord[] = [];
  const currentDate = new Date(startDate);
  // let daysQueried = 0;
  // let daysWithData = 0;
  // let errorCount = 0;
  let isFirstDay = true;

  while (currentDate <= endDate) {
    // On the first day, use the actual startDate time to respect rolling windows (e.g., 24h)
    // On subsequent days, use midnight as the start
    const dayStart = new Date(currentDate);
    if (isFirstDay) {
      // Keep the original time from startDate
      dayStart.setTime(startDate.getTime());
    } else {
      dayStart.setHours(0, 0, 0, 0);
    }

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Don't query future dates
    const now = new Date();
    if (dayEnd > now) {
      dayEnd.setTime(now.getTime());
    }

    // daysQueried++;
    try {
      // Use custom query function if provided, otherwise use default single-metric query
      const queryResult = config.queryFn
        ? await config.queryFn(dayStart, dayEnd)
        : await defaultAggregationQuery(dayStart, dayEnd, config.identifier, config.unit);

      if (queryResult === null) {
        // null indicates an error occurred in the custom query
        // errorCount++; // commented out to fix unused variable warning
      } else if (queryResult.hasData) {
        // daysWithData++; // commented out to fix unused variable warning
        // Use dayStart's date for the date string (normalized to midnight for consistent keys)
        const dateForKey = new Date(dayStart);
        dateForKey.setHours(0, 0, 0, 0);
        const dateStr = toLocalDateString(dateForKey);
        results.push({
          date: dateStr,
          value: queryResult.value,
          type: config.type,
        });
      }
    } catch (error) {
      // errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Failed to get aggregated ${config.logLabel}: ${message}`, 'ERROR');
    }

    currentDate.setDate(currentDate.getDate() + 1);
    isFirstDay = false;
  }

  // const errorSuffix = errorCount > 0 ? `, ${errorCount} errors` : '';
  // if (daysWithData === 0) {
  //   addLog(`[HealthKitService] No ${config.logLabel} data found for ${daysQueried} days queried${errorSuffix}`, 'DEBUG');
  // } else {
  //   addLog(`[HealthKitService] ${config.logLabel} aggregation: ${daysWithData}/${daysQueried} days with data${errorSuffix}`, 'DEBUG');
  // }

  return results;
};

export const getAggregatedStepsByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.steps);

export const getAggregatedActiveCaloriesByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.activeCalories);

export const getAggregatedTotalCaloriesByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.totalCalories);

export const getAggregatedDistanceByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.distance);

export const getAggregatedFloorsClimbedByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDate(startDate, endDate, AGGREGATION_CONFIGS.floorsClimbed);

// ============================================================================
// Record Handlers - modular handlers for different HealthKit record types
// ============================================================================

const QUERY_LIMIT = 20000;

// Handler function signature for reading health records
type RecordHandler = (
  identifier: string,
  startDate: Date,
  endDate: Date
) => Promise<unknown[]>;

// Filter helpers for date range checking
const isInDateRange = (recordDate: Date, startDate: Date, endDate: Date): boolean =>
  recordDate >= startDate && recordDate <= endDate;

const overlapsDateRange = (recordStart: Date, recordEnd: Date, rangeStart: Date, rangeEnd: Date): boolean =>
  recordStart < rangeEnd && recordEnd > rangeStart;

// Handler for SleepSession records
const handleSleepSession: RecordHandler = async (identifier, startDate, endDate) => {
  const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
    ascending: false,
    limit: QUERY_LIMIT,
  });

  // Use overlap check to include sessions that span range boundaries
  // (e.g., overnight sleep starting before midnight, ending after)
  const filteredSamples = samples.filter(s => {
    const recordStartDate = new Date(s.startDate);
    const recordEndDate = new Date(s.endDate);
    return overlapsDateRange(recordStartDate, recordEndDate, startDate, endDate);
  });

  return filteredSamples.map(s => ({
    startTime: s.startDate,
    endTime: s.endDate,
    value: s.value,
    metadata: (s as unknown as { metadata?: unknown }).metadata,
    sourceName: (s as unknown as { sourceName?: string }).sourceName,
    sourceId: (s as unknown as { sourceId?: string }).sourceId,
  }));
};

// Handler for Stress (MindfulSession) records
const handleStress: RecordHandler = async (identifier, startDate, endDate) => {
  const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
    ascending: false,
    limit: QUERY_LIMIT,
  });

  const filteredSamples = samples.filter(s => {
    const recordStartDate = new Date(s.startDate);
    return isInDateRange(recordStartDate, startDate, endDate);
  });

  return filteredSamples.map(s => ({
    startTime: s.startDate,
    endTime: s.endDate,
    value: 1, // MindfulSession doesn't have a direct stress level, so we record its presence
  }));
};

// Handler for reproductive health category types
const handleReproductiveHealth: RecordHandler = async (identifier, startDate, endDate) => {
  const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
    ascending: false,
    limit: QUERY_LIMIT,
  });

  const filteredSamples = samples.filter(s => {
    const recordStartDate = new Date(s.startDate);
    return isInDateRange(recordStartDate, startDate, endDate);
  });

  return filteredSamples.map(s => ({
    startTime: s.startDate,
    endTime: s.endDate,
    value: s.value, // Category value (enum integer)
  }));
};

// Handler for Workout/ExerciseSession records
const handleWorkout: RecordHandler = async (_identifier, startDate, endDate) => {
  const workouts = await queryWorkoutSamples({
    ascending: false,
    limit: QUERY_LIMIT,
  });

  // Use overlap check to include workouts that span range boundaries
  const filteredWorkouts = workouts.filter(w => {
    const workoutStart = new Date(w.startDate);
    const workoutEnd = new Date(w.endDate);
    return overlapsDateRange(workoutStart, workoutEnd, startDate, endDate);
  });

  // Fetch statistics (calories, distance) for each workout
  const workoutsWithStats = await Promise.all(filteredWorkouts.map(async (w) => {
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
          break;
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
};

// Handler for BloodPressure records (requires merging systolic and diastolic samples)
const handleBloodPressure: RecordHandler = async (_identifier, startDate, endDate) => {
  const [systolicSamples, diastolicSamples] = await Promise.all([
    queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', {
      ascending: false,
      limit: QUERY_LIMIT,
    }),
    queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', {
      ascending: false,
      limit: QUERY_LIMIT,
    }),
  ]);

  const filteredSystolic = systolicSamples.filter(s => {
    const sampleDate = new Date(s.startDate);
    return isInDateRange(sampleDate, startDate, endDate);
  });
  const filteredDiastolic = diastolicSamples.filter(s => {
    const sampleDate = new Date(s.startDate);
    return isInDateRange(sampleDate, startDate, endDate);
  });

  // Merge systolic and diastolic readings by timestamp
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

  return Array.from(bpMap.values())
    .filter(r => r.systolic && r.diastolic)
    .map(r => ({
      systolic: { inMillimetersOfMercury: r.systolic },
      diastolic: { inMillimetersOfMercury: r.diastolic },
      time: r.time,
    }));
};

// Transform map for standard quantity types - maps recordType to output structure
const QUANTITY_TRANSFORMS: Record<string, (baseRecord: Record<string, unknown>, quantity: number) => Record<string, unknown>> = {
  'Steps': (base) => base,
  'ActiveCaloriesBurned': (base, q) => ({ ...base, energy: { inCalories: q } }),
  'TotalCaloriesBurned': (base, q) => ({ ...base, energy: { inCalories: q } }),
  'HeartRate': (base, q) => ({ ...base, samples: [{ beatsPerMinute: q }] }),
  'Weight': (base, q) => ({ ...base, weight: { inKilograms: q } }),
  'Height': (base, q) => ({ ...base, height: { inMeters: q } }),
  'BodyFat': (base, q) => ({ ...base, percentage: { inPercent: q * 100 } }),
  'BodyTemperature': (base, q) => ({ ...base, temperature: { inCelsius: q } }),
  'BloodGlucose': (base, q) => ({ ...base, level: { inMilligramsPerDeciliter: q } }),
  'OxygenSaturation': (base, q) => ({ ...base, percentage: { inPercent: q * 100 } }),
  'Vo2Max': (base, q) => ({ ...base, vo2Max: q }),
  'RestingHeartRate': (base, q) => ({ ...base, beatsPerMinute: q }),
  'RespiratoryRate': (base, q) => ({ ...base, rate: q }),
  'Distance': (base, q) => ({ ...base, distance: { inMeters: q } }),
  'FloorsClimbed': (base, q) => ({ ...base, floors: q }),
  'Hydration': (base, q) => ({ ...base, volume: { inLiters: q } }),
  'LeanBodyMass': (base, q) => ({ ...base, mass: { inKilograms: q } }),
};

// Handler for standard quantity types (most common metrics)
const createQuantityHandler = (recordType: string): RecordHandler => {
  return async (identifier, startDate, endDate) => {
    if (!SUPPORTED_HK_TYPES.has(identifier)) {
      return [];
    }

    const unit = HEALTHKIT_UNIT_MAP[recordType];
    const queryOptions: { ascending: boolean; limit: number; unit?: string } = {
      ascending: false,
      limit: QUERY_LIMIT,
    };
    if (unit) {
      queryOptions.unit = unit;
    }

    const samples = await queryQuantitySamples(identifier as Parameters<typeof queryQuantitySamples>[0], queryOptions);

    if (!Array.isArray(samples)) {
      return [];
    }

    const filteredSamples = samples.filter(record => {
      const recordDate = new Date(record.startDate);
      return isInDateRange(recordDate, startDate, endDate);
    });

    const transform = QUANTITY_TRANSFORMS[recordType] || ((base: Record<string, unknown>) => base);

    return filteredSamples.map(s => {
      const baseRecord = {
        startTime: s.startDate,
        endTime: s.endDate,
        time: s.startDate,
        value: s.quantity,
      };
      return transform(baseRecord, s.quantity);
    });
  };
};

// Registry mapping record types to their handlers
const RECORD_HANDLERS: Record<string, RecordHandler> = {
  'SleepSession': handleSleepSession,
  'Stress': handleStress,
  'IntermenstrualBleeding': handleReproductiveHealth,
  'MenstruationFlow': handleReproductiveHealth,
  'OvulationTest': handleReproductiveHealth,
  'CervicalMucus': handleReproductiveHealth,
  'Workout': handleWorkout,
  'ExerciseSession': handleWorkout,
  'BloodPressure': handleBloodPressure,
};

// Read health records from HealthKit
export const readHealthRecords = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> => {
  if (!isHealthKitAvailable) {
    return [];
  }

  try {
    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    if (!identifier) {
      return [];
    }

    // Use registered handler if available, otherwise create a quantity handler
    const handler = RECORD_HANDLERS[recordType] || createQuantityHandler(recordType);
    return await handler(identifier, startDate, endDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Error reading ${recordType}: ${message}`, 'ERROR');
    return [];
  }
};
