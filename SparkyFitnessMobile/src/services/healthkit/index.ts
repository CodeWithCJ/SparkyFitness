import {
  requestAuthorization,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  isHealthDataAvailable,
  queryCategorySamples,
  queryWorkoutSamples,
  queryCorrelationSamples,
  type QueryStatisticsResponse,
  type StatisticsOptions,
} from '@kingstinct/react-native-healthkit';
import { Platform, Alert } from 'react-native';
import { addLog } from '../LogService';
import {
  AggregatedHealthRecord,
  MetricConfig,
  PermissionRequest,
  TransformedRecord,
  HEALTHKIT_SOURCE,
} from '../../types/healthRecords';
import { getSyncStartDate } from '../../utils/syncUtils';
import { getDeviceTimezone } from '../../utils/dateUtils';
import { toLocalDateString, mapDayStatisticsToMinMaxAvg } from './dataAggregation';
import { BLOOD_GLUCOSE_MG_DL_PER_MMOL_L } from './dataTransformation';
import { DIETARY_WRITE_IDENTIFIERS } from './writebackMappers';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };

// Track if HealthKit is available on this device
let isHealthKitAvailable = false;

// ============================================================================
// Database inaccessible error detection (locked device)
// ============================================================================

// When the device is locked, HealthKit encrypts its database. Queries return
// empty arrays or throw HKError.errorDatabaseInaccessible (code 6). We detect
// this via the error message so background sync can distinguish "locked" from
// "genuinely no data".
let databaseInaccessibleCount = 0;

export function resetDatabaseInaccessibleCount(): void {
  databaseInaccessibleCount = 0;
}

export function getDatabaseInaccessibleCount(): number {
  return databaseInaccessibleCount;
}

export function isDatabaseInaccessibleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('protected health data') || msg.includes('errordatabaseinaccessible');
}

// Classify and log a failed HealthKit read, bumping the locked-device counter when the
// database was inaccessible. Returns the message for the caller's { records, error }
// envelope so a failed read is distinguishable from a successful empty one.
const recordReadError = (error: unknown, label: string): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (isDatabaseInaccessibleError(error)) {
    databaseInaccessibleCount++;
    addLog(`[HealthKitService] ${label} failed: database inaccessible (device likely locked)`, 'WARNING');
  } else {
    addLog(`[HealthKitService] ${label} failed: ${message}`, 'ERROR');
  }
  return message;
};

// Read-result envelope mirroring Android's HealthConnectReadResult: callers surface
// `error` in sync results and hold the sync cursor instead of treating a failed read
// as "synced, 0 records".
export interface HealthKitReadResult<T = unknown> {
  records: T[];
  error?: string;
}

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
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
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
  'HeartRateVariabilitySDNN': 'ms',
  // Add other metrics that need explicit units as needed
};

// Map our internal health metric types to the official HealthKit identifiers
export const HEALTHKIT_TYPE_MAP: Record<string, string> = {
  'Steps': 'HKQuantityTypeIdentifierStepCount',
  'HeartRate': 'HKQuantityTypeIdentifierHeartRate',
  'ActiveCaloriesBurned': 'HKQuantityTypeIdentifierActiveEnergyBurned',
  'TotalCaloriesBurned': 'HKQuantityTypeIdentifierBasalEnergyBurned',
  'Weight': 'HKQuantityTypeIdentifierBodyMass',
  'Height': 'HKQuantityTypeIdentifierHeight',
  'BodyFat': 'HKQuantityTypeIdentifierBodyFatPercentage',
  'BloodPressure': 'BloodPressure', // Special case, handled separately
  'Nutrition': 'Nutrition', // Special case (writeback only) — handled separately
  'BloodPressureSystolic': 'HKQuantityTypeIdentifierBloodPressureSystolic',
  'BloodPressureDiastolic': 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'BodyTemperature': 'HKQuantityTypeIdentifierBodyTemperature',
  'BloodGlucose': 'HKQuantityTypeIdentifierBloodGlucose',
  'OxygenSaturation': 'HKQuantityTypeIdentifierOxygenSaturation',
  'Vo2Max': 'HKQuantityTypeIdentifierVO2Max',
  'RestingHeartRate': 'HKQuantityTypeIdentifierRestingHeartRate',
  'HeartRateVariabilitySDNN': 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
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
  if (isSimulator && !(globalThis as Record<string, unknown>).FORCE_HEALTHKIT_ON_SIM) {
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
      } else if (p.recordType === 'Nutrition') {
        // HealthKit authorizes the *contents* of a Food correlation, not the correlation
        // type itself — passing HKCorrelationTypeIdentifierFood to requestAuthorization
        // raises an NSInvalidArgumentException. So both directions request only the
        // contained dietary quantity types: read auth on each lets queryCorrelationSamples
        // return the correlation (symmetric with how writeback saves a correlation with
        // write auth on the contained types only). Read and write accumulate into separate
        // Sets, so the two Nutrition perms (read from HealthMetrics, write from
        // WritebackMetrics) never clobber.
        if (p.accessType === 'read') {
          DIETARY_WRITE_IDENTIFIERS.forEach((identifier) => readPermissionsSet.add(identifier));
        } else if (p.accessType === 'write') {
          DIETARY_WRITE_IDENTIFIERS.forEach((identifier) => writePermissionsSet.add(identifier));
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

// Configuration for aggregated cumulative health metrics
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

const startOfLocalDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * One statistics-collection query for the whole [filterStart, endDate] range, bucketed
 * into local calendar days (NSCalendar day intervals, so DST transitions stay correct).
 * Replaces the per-day queryStatisticsForQuantity loop — a 365d backfill was ~365
 * sequential native queries per metric against a 60s timeout; now it is one.
 *
 * Throws on native errors — callers classify via recordReadError and return an error
 * envelope instead of treating the failure as an empty read.
 */
const queryDayStatistics = async (
  identifier: string,
  statistics: readonly StatisticsOptions[],
  filterStart: Date,
  endDate: Date,
  unit?: string,
): Promise<QueryStatisticsResponse[]> => {
  const now = new Date();
  const filterEnd = endDate.getTime() < now.getTime() ? endDate : now; // never query future dates
  const options: { filter: { date: { startDate: Date; endDate: Date } }; unit?: string } = {
    filter: { date: { startDate: filterStart, endDate: filterEnd } },
  };
  if (unit) {
    options.unit = unit;
  }

  const buckets = await queryStatisticsCollectionForQuantity(
    identifier as Parameters<typeof queryStatisticsCollectionForQuantity>[0],
    statistics,
    startOfLocalDay(filterStart), // anchor buckets to local midnight
    { day: 1 },
    options,
  );

  // Keep buckets that overlap [filterStart, filterEnd]:
  //  - the first bucket STARTS at the midnight before filterStart (partial first day — keep),
  //  - today's bucket ENDS at tomorrow's midnight (in-progress today — keep; a
  //    `bucket.endDate <= filterEnd` guard here would drop today's data on every sync).
  return buckets
    .filter(bucket => bucket.startDate != null && bucket.endDate != null
      && new Date(bucket.endDate).getTime() > filterStart.getTime()
      && new Date(bucket.startDate).getTime() <= filterEnd.getTime())
    .sort((a, b) => new Date(a.startDate as Date).getTime() - new Date(b.startDate as Date).getTime());
};

// Generic aggregation for cumulative HealthKit metrics. One statistics-collection query
// per metric; HealthKit handles cross-source deduplication.
const getAggregatedDataByDateDetailed = async (
  startDate: Date,
  endDate: Date,
  config: AggregationConfig
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available for ${config.logLabel} aggregation`, 'DEBUG');
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(config.identifier, ['cumulativeSum'], startDate, endDate, config.unit);
    const deviceTz = getDeviceTimezone();
    const records: AggregatedHealthRecord[] = [];
    for (const bucket of buckets) {
      const sum = bucket.sumQuantity?.quantity ?? 0;
      // Compare before rounding so a 0 < sum < 0.5 day still emits (as 0), matching the
      // per-day loop this replaced.
      if (sum > 0) {
        records.push({
          date: toLocalDateString(new Date(bucket.startDate as Date)),
          value: Math.round(sum),
          type: config.type,
          record_timezone: deviceTz,
        });
      }
    }
    return { records };
  } catch (error) {
    return { records: [], error: recordReadError(error, `Aggregated ${config.logLabel} query`) };
  }
};

export const getAggregatedStepsByDateDetailed = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDateDetailed(startDate, endDate, AGGREGATION_CONFIGS.steps);

export const getAggregatedStepsByDate = (startDate: Date, endDate: Date) =>
  getAggregatedStepsByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedActiveCaloriesByDateDetailed = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDateDetailed(startDate, endDate, AGGREGATION_CONFIGS.activeCalories);

export const getAggregatedActiveCaloriesByDate = (startDate: Date, endDate: Date) =>
  getAggregatedActiveCaloriesByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedDistanceByDateDetailed = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDateDetailed(startDate, endDate, AGGREGATION_CONFIGS.distance);

export const getAggregatedDistanceByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDistanceByDateDetailed(startDate, endDate).then(result => result.records);

export const getAggregatedFloorsClimbedByDateDetailed = (startDate: Date, endDate: Date) =>
  getAggregatedDataByDateDetailed(startDate, endDate, AGGREGATION_CONFIGS.floorsClimbed);

export const getAggregatedFloorsClimbedByDate = (startDate: Date, endDate: Date) =>
  getAggregatedFloorsClimbedByDateDetailed(startDate, endDate).then(result => result.records);

// Total calories = Basal + Active energy summed per local day, via two collection
// queries merged by day string. All-or-nothing: either query failing errors the whole
// metric (so the sync cursor holds) rather than silently under-reporting days.
export const getAggregatedTotalCaloriesByDateDetailed = async (
  startDate: Date,
  endDate: Date,
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog('[HealthKitService] HealthKit not available for total calories aggregation', 'DEBUG');
    return { records: [] };
  }

  try {
    const [basalBuckets, activeBuckets] = await Promise.all([
      queryDayStatistics('HKQuantityTypeIdentifierBasalEnergyBurned', ['cumulativeSum'], startDate, endDate, 'kcal'),
      queryDayStatistics('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], startDate, endDate, 'kcal'),
    ]);

    const totalsByDay = new Map<string, number>();
    for (const buckets of [basalBuckets, activeBuckets]) {
      for (const bucket of buckets) {
        const sum = bucket.sumQuantity?.quantity ?? 0;
        if (sum > 0) {
          const day = toLocalDateString(new Date(bucket.startDate as Date));
          totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + sum);
        }
      }
    }

    const deviceTz = getDeviceTimezone();
    // YYYY-MM-DD keys sort lexicographically = chronologically.
    const records = Array.from(totalsByDay.entries())
      .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
      .map(([date, total]) => ({
        date,
        value: Math.round(total),
        type: 'total_calories',
        record_timezone: deviceTz,
      }));
    return { records };
  } catch (error) {
    return { records: [], error: recordReadError(error, 'Total calories query') };
  }
};

export const getAggregatedTotalCaloriesByDate = (startDate: Date, endDate: Date) =>
  getAggregatedTotalCaloriesByDateDetailed(startDate, endDate).then(result => result.records);

/**
 * Aggregates Apple Health Resting/Basal Energy for the BMR override.
 *
 * Unlike getAggregatedDataByDateDetailed, this:
 *  - queries whole days only (the filter starts at local midnight of startDate, matching
 *    the per-day loop this replaced, which never used startDate's mid-day time),
 *  - keeps ONLY fully-elapsed days (excludes today's partial, wear-dependent total), and
 *  - stamps each complete day D's value with D+1 as its `date` (the day it should apply
 *    to). This lets the server do an exact-date lookup: today's summary picks up
 *    yesterday's complete resting energy, mirroring Cronometer's prior-complete-day import.
 *
 * Emits records of type `basal_metabolic_rate` so the server stores/reads them the same
 * way as Android's Health Connect BasalMetabolicRate.
 */
export const getAggregatedBasalEnergyByDateDetailed = async (
  startDate: Date,
  endDate: Date
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog('[HealthKitService] HealthKit not available for basal energy aggregation', 'DEBUG');
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      ['cumulativeSum'],
      startOfLocalDay(startDate),
      endDate,
      'kcal',
    );

    const startOfToday = startOfLocalDay(new Date());
    const deviceTz = getDeviceTimezone();
    const records: AggregatedHealthRecord[] = [];
    for (const bucket of buckets) {
      const bucketEnd = new Date(bucket.endDate as Date);
      // Complete days only: a bucket ends at local midnight of D+1, so any bucket ending
      // after start-of-today (or past the requested window) is a partial day — skip it.
      if (bucketEnd.getTime() > startOfToday.getTime() || bucketEnd.getTime() > endDate.getTime()) {
        continue;
      }
      const basal = bucket.sumQuantity?.quantity ?? 0;
      if (basal > 0) {
        // Stamp with the FOLLOWING day — bucket.endDate IS local midnight of D+1
        // (DST-correct, unlike setDate(+1) arithmetic on a pinned clock time).
        records.push({
          date: toLocalDateString(bucketEnd),
          value: Math.round(basal),
          type: 'basal_metabolic_rate',
          record_timezone: deviceTz,
        });
      }
    }
    return { records };
  } catch (error) {
    return { records: [], error: recordReadError(error, 'Basal energy query') };
  }
};

export const getAggregatedBasalEnergyByDate = (startDate: Date, endDate: Date) =>
  getAggregatedBasalEnergyByDateDetailed(startDate, endDate).then(result => result.records);

// ============================================================================
// min-max-avg day statistics (native HKStatisticsCollection reads)
// ============================================================================

interface MinMaxAvgDayStatsSpec {
  identifier: string;
  /** HealthKit QUERY unit only. The emitted record unit is always metric.unit —
   *  e.g. HeartRate queries 'count/min' but emits 'bpm'. */
  statsUnit: string;
  /** Converts a queried value into metric.unit (e.g. mg/dL → mmol/L). */
  toValue?: (value: number) => number;
}

// min-max-avg metrics with a VERIFIED native day-statistics read, keyed by recordType
// (iOS SpO2 is 'BloodOxygenSaturation'; 'OxygenSaturation' is the Android recordType).
// Each statsUnit pins the query so values match the sample path it replaces:
//  - BloodGlucose: the sample path read mg/dL and divided in dataTransformation.ts;
//  - BloodOxygenSaturation: HealthKit '%' is a 0–1 fraction; the sample path ×100.
// Gait/running/cycling min-max-avg metrics deliberately STAY on the sample path: their
// sample reads never pinned a unit (no HEALTHKIT_UNIT_MAP entry), so they historically
// synced in the user's HealthKit-preferred unit and pinning a stats unit here could
// shift scales vs already-synced server data (converting them is a Phase 3 candidate).
// Hydration ('sum') stays on samples for its per-sample sourceBundleId writeback echo
// guard; CyclingFunctionalThresholdPower ('last') and the Apple move/exercise/stand
// times ('sum') stay as well.
const MIN_MAX_AVG_DAY_STATS: Record<string, MinMaxAvgDayStatsSpec> = {
  HeartRate: { identifier: 'HKQuantityTypeIdentifierHeartRate', statsUnit: 'count/min' },
  HeartRateVariabilitySDNN: { identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', statsUnit: 'ms' },
  RespiratoryRate: { identifier: 'HKQuantityTypeIdentifierRespiratoryRate', statsUnit: 'count/min' },
  BloodGlucose: {
    identifier: 'HKQuantityTypeIdentifierBloodGlucose',
    statsUnit: 'mg/dL',
    toValue: (value) => value / BLOOD_GLUCOSE_MG_DL_PER_MMOL_L,
  },
  BloodOxygenSaturation: {
    identifier: 'HKQuantityTypeIdentifierOxygenSaturation',
    statsUnit: '%',
    toValue: (value) => value * 100,
  },
};

/**
 * Day-bucketed min/max/avg for a metric via one native statistics-collection query,
 * emitting records in aggregateByDay's exact output shape. The result is already
 * day-aggregated — callers must NOT run it through aggregateByDay again.
 *
 * Returns null when the metric has no verified spec — the caller falls back to the raw
 * sample path with its ORIGINAL window. Known deltas vs the sample path: discreteAverage
 * is time-weighted (matches the Health app; the old path was an arithmetic mean of
 * samples pre-rounded to 2dp), and record_timezone is always the device timezone (the
 * old path used a sample's HKTimeZone metadata when present).
 */
export const readMinMaxAvgByDayDetailed = async (
  metric: MetricConfig,
  startDate: Date,
  endDate: Date,
): Promise<HealthKitReadResult<TransformedRecord> | null> => {
  const spec = MIN_MAX_AVG_DAY_STATS[metric.recordType];
  if (!spec) return null;

  if (!isHealthKitAvailable) {
    addLog(`[HealthKitService] HealthKit not available for ${metric.recordType} day statistics`, 'DEBUG');
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(
      spec.identifier,
      ['discreteMin', 'discreteMax', 'discreteAverage'],
      startDate,
      endDate,
      spec.statsUnit,
    );
    const records = mapDayStatisticsToMinMaxAvg(
      buckets,
      metric.type,
      metric.unit,
      HEALTHKIT_SOURCE,
      getDeviceTimezone(),
      spec.toValue,
    );
    return { records };
  } catch (error) {
    return { records: [], error: recordReadError(error, `${metric.recordType} day statistics query`) };
  }
};

// ============================================================================
// Record Handlers - modular handlers for different HealthKit record types
// ============================================================================

// Handler function signature for reading health records
type RecordHandler = (
  identifier: string,
  startDate: Date,
  endDate: Date
) => Promise<unknown[]>;

// Filter helpers for date range checking. Every handler pushes the window into the
// native query (filter + limit: 0 = all in-window samples) instead of taking the most
// recent N samples across ALL history and post-filtering — a dense or old history would
// otherwise silently drop valid in-window records. The JS guards below are kept
// belt-and-suspenders: the native predicate matches on sample-interval overlap (right
// for sleep/workouts), while isInDateRange keeps point-sample semantics exact.
const isInDateRange = (recordDate: Date, startDate: Date, endDate: Date): boolean =>
  recordDate >= startDate && recordDate <= endDate;

const overlapsDateRange = (recordStart: Date, recordEnd: Date, rangeStart: Date, rangeEnd: Date): boolean =>
  recordStart < rangeEnd && recordEnd > rangeStart;

// Handler for SleepSession records
const handleSleepSession: RecordHandler = async (identifier, startDate, endDate) => {
  const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
    ascending: false,
    limit: 0,
    filter: { date: { startDate, endDate } },
  });

  // Use overlap check to include sessions that span range boundaries
  // (e.g., overnight sleep starting before midnight, ending after)
  const filteredSamples = samples.filter(s => {
    const recordStartDate = new Date(s.startDate);
    const recordEndDate = new Date(s.endDate);
    return overlapsDateRange(recordStartDate, recordEndDate, startDate, endDate);
  });

  return filteredSamples.map(s => {
    // Normalize timezone: HealthKit exposes timezone as both metadata.HKTimeZone
    // and the flattened metadataTimeZone field. Ensure HKTimeZone is always set
    // so the aggregation layer can find it consistently.
    const rawMetadata = (s as unknown as { metadata?: Record<string, unknown> }).metadata;
    const flatTz = (s as unknown as { metadataTimeZone?: string }).metadataTimeZone;
    const metadata = rawMetadata
      ? { ...rawMetadata, ...(flatTz && !rawMetadata.HKTimeZone ? { HKTimeZone: flatTz } : {}) }
      : (flatTz ? { HKTimeZone: flatTz } : undefined);

    return {
      startTime: s.startDate,
      endTime: s.endDate,
      value: s.value,
      metadata,
      sourceName: (s as unknown as { sourceName?: string }).sourceName,
      sourceId: (s as unknown as { sourceId?: string }).sourceId,
    };
  });
};

// Handler for Stress (MindfulSession) records
const handleStress: RecordHandler = async (identifier, startDate, endDate) => {
  const samples = await queryCategorySamples(identifier as Parameters<typeof queryCategorySamples>[0], {
    ascending: false,
    limit: 0,
    filter: { date: { startDate, endDate } },
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
    limit: 0,
    filter: { date: { startDate, endDate } },
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
    limit: 0,
    filter: { date: { startDate, endDate } },
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
      totalEnergyBurned?: number | { quantity?: number };
      totalDistance?: number | { quantity?: number };
    };

    // Start with direct properties from workout sample (fallback for older workouts).
    // The HealthKit library returns Quantity objects: { unit: string, quantity: number }
    let totalEnergyBurned = typeof workoutAny.totalEnergyBurned === 'object'
      ? (workoutAny.totalEnergyBurned?.quantity ?? 0)
      : (workoutAny.totalEnergyBurned ?? 0);
    let totalDistance = typeof workoutAny.totalDistance === 'object'
      ? (workoutAny.totalDistance?.quantity ?? 0)
      : (workoutAny.totalDistance ?? 0);

    // Pin units explicitly on each getStatistic call. getAllStatistics returns
    // values in the user's HealthKit-preferred unit (often miles / kJ), but the
    // transform layer assumes meters / kcal, so we'd silently store mis-scaled
    // values otherwise.
    try {
      const energyStats = await w.getStatistic(
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'kcal',
      );
      if (energyStats?.sumQuantity?.quantity) {
        totalEnergyBurned = energyStats.sumQuantity.quantity;
      }

      const distanceTypes = [
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'HKQuantityTypeIdentifierDistanceCycling',
        'HKQuantityTypeIdentifierDistanceSwimming',
        'HKQuantityTypeIdentifierDistanceWheelchair',
        'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
      ] as const;
      for (const distanceType of distanceTypes) {
        const distanceStats = await w.getStatistic(distanceType, 'm');
        if (distanceStats?.sumQuantity?.quantity) {
          totalDistance = distanceStats.sumQuantity.quantity;
          break;
        }
      }
    } catch {
      // Stats fetch failed - keep using direct properties from workout
    }

    const record: Record<string, unknown> = {
      startTime: w.startDate,
      endTime: w.endDate,
      activityType: w.workoutActivityType,
      duration: w.duration,
      totalEnergyBurned,
      totalDistance,
      uuid: (w as unknown as { uuid?: string }).uuid,
    };
    // Forward timezone metadata so the transform layer can attach it to output records
    const tz = (w as unknown as { metadataTimeZone?: string }).metadataTimeZone;
    if (tz) {
      record.metadata = { HKTimeZone: tz };
    }
    return record;
  }));

  return workoutsWithStats;
};

// Handler for BloodPressure records (requires merging systolic and diastolic samples)
const handleBloodPressure: RecordHandler = async (_identifier, startDate, endDate) => {
  const [systolicSamples, diastolicSamples] = await Promise.all([
    queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureSystolic', {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
    }),
    queryQuantitySamples('HKQuantityTypeIdentifierBloodPressureDiastolic', {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
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
  'BloodOxygenSaturation': (base, q) => ({ ...base, percentage: { inPercent: q * 100 } }),
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
    const queryOptions: {
      ascending: boolean;
      limit: number;
      filter: { date: { startDate: Date; endDate: Date } };
      unit?: string;
    } = {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
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
      const baseRecord: Record<string, unknown> = {
        startTime: s.startDate,
        endTime: s.endDate,
        time: s.startDate,
        value: s.quantity,
        // Origin app's bundle id, for the writeback feedback-loop guard (Hydration
        // transformer skips records this app wrote). Nested under sourceRevision.source
        // — there is no pre-flattened source field, so this path is read directly.
        sourceBundleId: (s as unknown as { sourceRevision?: { source?: { bundleIdentifier?: string } } })
          .sourceRevision?.source?.bundleIdentifier,
      };
      // Forward timezone metadata so the transform layer can attach it to output records
      const tz = (s as unknown as { metadataTimeZone?: string }).metadataTimeZone;
      if (tz) {
        baseRecord.metadata = { HKTimeZone: tz };
      }
      return transform(baseRecord, s.quantity);
    });
  };
};

// HealthKit has no single "nutrition record" — each nutrient is an independent quantity
// sample. Some apps group a meal's samples into an HKCorrelationTypeIdentifierFood
// correlation (carrying a food name + stable uuid); others (Cronometer, MyFitnessPal) write
// only loose per-nutrient samples with no correlation. We read BOTH: correlations for named
// entries, plus loose samples grouped by (source, event-instant) into one entry per food.
// Loose samples already contained in a correlation are excluded so nothing double-counts.
// Keeps HealthKit I/O here; the per-nutrient unit mapping is pure in dataTransformation.ts.

// Build the normalized record the Nutrition transformer consumes from a contained-sample
// list. `foodLabel` is the correlation's food name, or the source app's name for loose groups.
const toNutritionRecord = (params: {
  objects: { quantityType?: string; quantity?: number; unit?: string }[];
  foodLabel?: string;
  uuid?: string;
  startIso: string;
  sourceBundleId?: string;
  timeZone?: string;
}): Record<string, unknown> => {
  const record: Record<string, unknown> = {
    objects: params.objects,
    metadataFoodType: params.foodLabel,
    uuid: params.uuid,
    startDate: params.startIso,
    sourceBundleId: params.sourceBundleId,
  };
  // Normalize the flattened metadataTimeZone into metadata.HKTimeZone so the transform
  // layer's extractTimezoneMetadata finds it — same hop createQuantityHandler does.
  if (params.timeZone) {
    record.metadata = { HKTimeZone: params.timeZone };
  }
  return record;
};

const toIsoString = (date: string | Date): string =>
  typeof date === 'string' ? date : new Date(date).toISOString();

interface LooseGroup {
  bundleId?: string;
  startIso: string;
  timeZone?: string;
  objects: { quantityType: string; quantity: number; unit: string }[];
}

// Reconstruct per-food entries from LOOSE dietary samples — those NOT contained in any Food
// correlation. A source's samples are grouped by event instant (one logged food = one shared
// timestamp). `correlationUuids` are the contained-sample UUIDs to skip so we never
// double-count nutrients that the correlation read already returned.
const readLooseNutrition = async (
  startDate: Date,
  endDate: Date,
  correlationUuids: Set<string>,
): Promise<Record<string, unknown>[]> => {
  const groups = new Map<string, LooseGroup>();
  // Filter to the window natively (limit: 0 = all in-window samples) instead of taking a
  // capped number of newest samples across all history and discarding out-of-window ones —
  // a large or old dietary history would otherwise silently drop valid in-window samples.
  const dateFilter = { date: { startDate, endDate } };

  for (const identifier of DIETARY_WRITE_IDENTIFIERS) {
    const samples = await queryQuantitySamples(
      identifier as Parameters<typeof queryQuantitySamples>[0],
      { filter: dateFilter, limit: 0, ascending: false },
    );
    if (!Array.isArray(samples)) continue;

    for (const s of samples) {
      const sample = s as unknown as {
        uuid?: string;
        startDate: string | Date;
        quantity: number;
        unit: string;
        metadataTimeZone?: string;
        sourceRevision?: { source?: { bundleIdentifier?: string } };
      };
      if (!isInDateRange(new Date(sample.startDate), startDate, endDate)) continue;
      if (sample.uuid && correlationUuids.has(sample.uuid)) continue; // already in a correlation

      const bundleId = sample.sourceRevision?.source?.bundleIdentifier;
      const startIso = toIsoString(sample.startDate);
      const key = `${bundleId ?? 'unknown'}|${startIso}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          bundleId,
          startIso,
          timeZone: sample.metadataTimeZone,
          objects: [],
        };
        groups.set(key, group);
      }
      group.objects.push({ quantityType: identifier, quantity: sample.quantity, unit: sample.unit });
    }
  }

  // Loose samples carry no food name (the source's display name is unreachable — Nitro's
  // SourceProxy shadows it), so leave foodLabel unset; the transformer falls back to
  // "Apple Health food", matching Health Connect's "Health Connect food" parity.
  return Array.from(groups.values()).map(group =>
    toNutritionRecord({
      objects: group.objects,
      // Synthetic but stable idempotency key: same source + instant re-reads to the same
      // entry, so re-syncing upserts in place (server keys on (user, source, source_id)).
      uuid: `${group.bundleId ?? 'unknown'}:${group.startIso}`,
      startIso: group.startIso,
      sourceBundleId: group.bundleId,
      timeZone: group.timeZone,
    }),
  );
};

const handleNutrition: RecordHandler = async (_identifier, startDate, endDate) => {
  // Filter to the window natively (limit: 0 = all in-window correlations) instead of taking
  // a capped number of newest ones across all history and discarding out-of-window ones — a
  // large or old food history would otherwise silently drop valid in-window correlations.
  const dateFilter = { date: { startDate, endDate } };

  // 1. Named Food correlations (e.g. LoseIt). Collect contained-sample UUIDs so the loose
  //    read below doesn't double-count the same nutrients.
  const correlations = await queryCorrelationSamples('HKCorrelationTypeIdentifierFood', {
    filter: dateFilter,
    limit: 0,
    ascending: false,
  });
  // Belt-and-suspenders alongside the native filter: keep the exact [startDate, endDate]
  // guard in JS since the native predicate matches on sample-interval overlap.
  const inRange = correlations.filter(c => isInDateRange(new Date(c.startDate), startDate, endDate));

  const correlationUuids = new Set<string>();
  const correlationRecords = inRange.map(c => {
    const correlation = c as unknown as {
      uuid?: string;
      startDate: string | Date;
      metadataFoodType?: string;
      metadataTimeZone?: string;
      sourceRevision?: { source?: { bundleIdentifier?: string } };
      objects?: { uuid?: string; quantityType?: string; quantity?: number; unit?: string }[];
    };
    const objects = correlation.objects ?? [];
    for (const o of objects) {
      if (o.uuid) correlationUuids.add(o.uuid);
    }
    return toNutritionRecord({
      objects: objects.map(o => ({ quantityType: o.quantityType, quantity: o.quantity, unit: o.unit })),
      foodLabel: correlation.metadataFoodType,
      uuid: correlation.uuid,
      startIso: toIsoString(correlation.startDate),
      sourceBundleId: correlation.sourceRevision?.source?.bundleIdentifier,
      timeZone: correlation.metadataTimeZone,
    });
  });

  // 2. Loose per-nutrient samples (Cronometer, MyFitnessPal), grouped into per-food entries.
  const looseRecords = await readLooseNutrition(startDate, endDate, correlationUuids);

  return [...correlationRecords, ...looseRecords];
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
  'Nutrition': handleNutrition,
};

// Read health records from HealthKit. A failed read returns an error envelope so
// callers can surface it (and hold the sync cursor) instead of seeing an empty read.
export const readHealthRecordsDetailed = async (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<HealthKitReadResult> => {
  if (!isHealthKitAvailable) {
    return { records: [] };
  }

  try {
    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    if (!identifier) {
      return { records: [] };
    }

    // Use registered handler if available, otherwise create a quantity handler
    const handler = RECORD_HANDLERS[recordType] || createQuantityHandler(recordType);
    return { records: await handler(identifier, startDate, endDate) };
  } catch (error) {
    return { records: [], error: recordReadError(error, `${recordType} read`) };
  }
};

export const readHealthRecords = (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> =>
  readHealthRecordsDetailed(recordType, startDate, endDate).then(result => result.records);
