import {
  requestAuthorization,
  getRequestStatusForAuthorization,
  AuthorizationRequestStatus,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  isHealthDataAvailable,
  queryCategorySamples,
  queryWorkoutSamples,
  queryCorrelationSamples,
  queryActivitySummary,
  ActivitySummaryTypeIdentifier,
  type QueryStatisticsResponse,
  type StatisticsOptions,
} from '@kingstinct/react-native-healthkit';
import { Platform, Alert } from 'react-native';
import { addLog } from '../LogService';
import i18n from '../../localization/i18n';
import { isAuthorizationNotDeterminedError } from '../../utils/healthErrors';
import {
  AggregatedHealthRecord,
  MetricConfig,
  PermissionRequest,
  TransformedRecord,
  HEALTHKIT_SOURCE,
  type ReadResult,
} from '../../types/healthRecords';
import { getSyncStartDate } from '../../utils/syncUtils';
import { getDeviceTimezone } from '../../utils/dateUtils';
import {
  toLocalDateString,
  mapDayStatisticsToMinMaxAvg,
} from './dataAggregation';
import { BLOOD_GLUCOSE_MG_DL_PER_MMOL_L } from '../shared/dataTransformation';
import {
  WATCH_SESSION_METADATA_KEY,
  isOwnWatchWorkout,
} from './dataTransformation';
import { DIETARY_WRITE_IDENTIFIERS } from './writebackMappers';
import {
  WORKOUT_EFFORT_IDENTIFIER,
  matchWorkoutEffort,
  readWorkoutEffortSamples,
} from './workoutEffort';
import {
  collectWorkoutTelemetry,
  type WorkoutProxyLike,
} from './workoutTelemetry';
import { readAppleWorkoutZoneGroups } from '../appleHeartZones';
import {
  createTelemetryRunContext,
  type TelemetryRunContext,
} from '../shared/telemetryBudget';
import {
  enrichedSessionOrder,
  hasEnrichedSession,
  sessionTelemetryKey,
} from '../shared/enrichedSessionCache';
import {
  createConcurrencyLimiter,
  runTasksInBatches,
} from '../../utils/concurrency';
import { getErrorMessage } from '../../utils/errors';

// Re-export for backward compatibility with callers importing from this module
export { getSyncStartDate };

/**
 * Two limits, because enrichment runs two very different costs per workout.
 * The statistics queries return a scalar each and run at the wider limit;
 * telemetry (route plus per-workout sample series) returns large arrays that
 * are parsed on the JS thread and stays tightly capped. See the matching
 * comment in healthconnect/index.ts.
 */
const AGGREGATE_CONCURRENCY = 6;
const TELEMETRY_CONCURRENCY = 2;

/** Shared across overlapping runs, so the cap is a real ceiling. */
const limitTelemetry = createConcurrencyLimiter(TELEMETRY_CONCURRENCY);

/**
 * Telemetry-collection cache key for a HealthKit workout. endDate moves if the
 * workout is still being written, so a session in flight is re-collected
 * rather than frozen at its first reading.
 */
const workoutCacheKey = (workout: unknown): string | null => {
  const w = workout as { uuid?: string; endDate?: string | Date };
  const end = w.endDate instanceof Date ? w.endDate.toISOString() : w.endDate;
  const key = sessionTelemetryKey(w.uuid, end);
  // v2: walks collected before route access was granted were cached with an
  // empty track, and the cache then skipped them forever. The suffix makes
  // the next sync read each workout once more.
  return key ? `${key}:v2` : null;
};

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
  return (
    msg.includes('protected health data') ||
    msg.includes('errordatabaseinaccessible')
  );
}

// Classify and log a failed HealthKit read, bumping the locked-device counter when the
// database was inaccessible. Returns the message for the caller's { records, error }
// envelope so a failed read is distinguishable from a successful empty one.
const recordReadError = (error: unknown, label: string): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (isDatabaseInaccessibleError(error)) {
    databaseInaccessibleCount++;
    addLog(
      `[HealthKitService] ${label} failed: database inaccessible (device likely locked)`,
      'WARNING'
    );
  } else if (isAuthorizationNotDeterminedError(error)) {
    addLog(
      `[HealthKitService] ${label}: authorization not determined (permission not yet granted)`,
      'INFO'
    );
  } else {
    addLog(`[HealthKitService] ${label} failed: ${message}`, 'ERROR');
  }
  return message;
};

// Read-result envelope: callers surface `error` in sync results and hold the sync
// cursor instead of treating a failed read as "synced, 0 records". Alias of the
// platform-neutral ReadResult shared with Android.
export type HealthKitReadResult<T = unknown> = ReadResult<T>;

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
  'HKWorkoutRouteTypeIdentifier', // GPS route attached to a workout
]);

/**
 * Types authorized alongside a workout read so its telemetry is readable.
 *
 * HealthKit authorizes each underlying type separately — workout access alone
 * grants neither the route nor the samples recorded during it. Every entry here
 * is only ever queried scoped to a workout, so they are requested with the
 * workout rather than surfaced as their own toggleable metrics.
 */
const WORKOUT_TELEMETRY_READ_IDENTIFIERS: readonly string[] = [
  'HKWorkoutRouteTypeIdentifier',
  // The person's own 1-10 rating of the workout, read by time window.
  WORKOUT_EFFORT_IDENTIFIER,
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRunningSpeed',
  'HKQuantityTypeIdentifierCyclingSpeed',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierCyclingPower',
  'HKQuantityTypeIdentifierCyclingCadence',
  'HKQuantityTypeIdentifierRunningGroundContactTime',
  'HKQuantityTypeIdentifierRunningVerticalOscillation',
  'HKQuantityTypeIdentifierRunningStrideLength',
];

// Map record types to the unit we want HealthKit to return values in.
// Without specifying a unit, HealthKit returns values in the user's preferred/locale unit,
// which can cause issues if we assume a specific unit (e.g., kg vs lbs).
const HEALTHKIT_UNIT_MAP: Record<string, string> = {
  Weight: 'kg',
  Height: 'm',
  LeanBodyMass: 'kg',
  Distance: 'm',
  Hydration: 'L',
  BodyTemperature: 'degC',
  BasalBodyTemperature: 'degC',
  BloodGlucose: 'mg/dL',
  HeartRateVariabilitySDNN: 'ms',
  // Add other metrics that need explicit units as needed
};

// Map our internal health metric types to the official HealthKit identifiers
export const HEALTHKIT_TYPE_MAP: Record<string, string> = {
  Steps: 'HKQuantityTypeIdentifierStepCount',
  HeartRate: 'HKQuantityTypeIdentifierHeartRate',
  ActiveCaloriesBurned: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  TotalCaloriesBurned: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  Weight: 'HKQuantityTypeIdentifierBodyMass',
  Height: 'HKQuantityTypeIdentifierHeight',
  BodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  BloodPressure: 'BloodPressure', // Special case, handled separately
  Nutrition: 'Nutrition', // Special case (writeback only) — handled separately
  BloodPressureSystolic: 'HKQuantityTypeIdentifierBloodPressureSystolic',
  BloodPressureDiastolic: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  BodyTemperature: 'HKQuantityTypeIdentifierBodyTemperature',
  BloodGlucose: 'HKQuantityTypeIdentifierBloodGlucose',
  OxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
  Vo2Max: 'HKQuantityTypeIdentifierVO2Max',
  RestingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  HeartRateVariabilitySDNN: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  RespiratoryRate: 'HKQuantityTypeIdentifierRespiratoryRate',
  Distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  FloorsClimbed: 'HKQuantityTypeIdentifierFlightsClimbed',
  Hydration: 'HKQuantityTypeIdentifierDietaryWater',
  LeanBodyMass: 'HKQuantityTypeIdentifierLeanBodyMass',
  SleepSession: 'HKCategoryTypeIdentifierSleepAnalysis',
  Stress: 'HKCategoryTypeIdentifierMindfulSession', // Map Stress to MindfulSession for HealthKit
  MindfulnessSession: 'HKCategoryTypeIdentifierMindfulSession',
  Workout: 'HKWorkoutTypeIdentifier', // Map Workout to HKWorkoutTypeIdentifier for HealthKit
  CervicalMucus: 'HKCategoryTypeIdentifierCervicalMucusQuality',
  // The route is its own HealthKit type; mapping it to the workout type would
  // authorize the workout again and leave the route unreadable. Note this
  // recordType must not be added to a metric's `permissions`: Health Connect
  // throws InvalidRecordType for a *read* ExerciseRoute permission, which would
  // fail the whole Android request. iOS gets it via
  // WORKOUT_TELEMETRY_READ_IDENTIFIERS instead.
  ExerciseRoute: 'HKWorkoutRouteTypeIdentifier',
  IntermenstrualBleeding: 'HKCategoryTypeIdentifierIntermenstrualBleeding',
  MenstruationFlow: 'HKCategoryTypeIdentifierMenstrualFlow',
  OvulationTest: 'HKCategoryTypeIdentifierOvulationTestResult',
  BloodAlcoholContent: 'HKQuantityTypeIdentifierBloodAlcoholContent',
  BloodOxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
  BasalBodyTemperature: 'HKQuantityTypeIdentifierBasalBodyTemperature',
  BasalMetabolicRate: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  ExerciseSession: 'HKWorkoutTypeIdentifier',
  CyclingCadence: 'HKQuantityTypeIdentifierCyclingCadence',
  DietaryFatTotal: 'HKQuantityTypeIdentifierDietaryFatTotal',
  DietaryProtein: 'HKQuantityTypeIdentifierDietaryProtein',
  DietarySodium: 'HKQuantityTypeIdentifierDietarySodium',
  WalkingSpeed: 'HKQuantityTypeIdentifierWalkingSpeed',
  WalkingStepLength: 'HKQuantityTypeIdentifierWalkingStepLength',
  WalkingAsymmetryPercentage:
    'HKQuantityTypeIdentifierWalkingAsymmetryPercentage',
  WalkingDoubleSupportPercentage:
    'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage',
  RunningGroundContactTime: 'HKQuantityTypeIdentifierRunningGroundContactTime',
  RunningStrideLength: 'HKQuantityTypeIdentifierRunningStrideLength',
  RunningPower: 'HKQuantityTypeIdentifierRunningPower',
  RunningVerticalOscillation:
    'HKQuantityTypeIdentifierRunningVerticalOscillation',
  RunningSpeed: 'HKQuantityTypeIdentifierRunningSpeed',
  CyclingSpeed: 'HKQuantityTypeIdentifierCyclingSpeed',
  CyclingPower: 'HKQuantityTypeIdentifierCyclingPower',
  CyclingFunctionalThresholdPower:
    'HKQuantityTypeIdentifierCyclingFunctionalThresholdPower',
  EnvironmentalAudioExposure:
    'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
  HeadphoneAudioExposure: 'HKQuantityTypeIdentifierHeadphoneAudioExposure',
  AppleMoveTime: 'HKQuantityTypeIdentifierAppleMoveTime',
  AppleExerciseTime: 'HKQuantityTypeIdentifierAppleExerciseTime',
  AppleStandTime: 'HKQuantityTypeIdentifierAppleStandTime',
};

// Alias for cross-platform compatibility - Android uses initHealthConnect
export const initHealthConnect = async (): Promise<boolean> => {
  try {
    isHealthKitAvailable = await isHealthDataAvailable();
    return isHealthKitAvailable;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthKitService] Failed to check HealthKit availability: ${message}`,
      'ERROR'
    );
    isHealthKitAvailable = false;
    return false;
  }
};

const healthKitAuthorizationTypes = (
  permissionsToRequest: PermissionRequest[]
): { toRead: string[]; toShare: string[] } => {
  const readPermissionsSet = new Set<string>();
  const writePermissionsSet = new Set<string>();

  permissionsToRequest.forEach((p) => {
    const healthkitIdentifier = HEALTHKIT_TYPE_MAP[p.recordType];
    if (healthkitIdentifier) {
      // Special handling for BloodPressure, which involves two identifiers
      if (p.recordType === 'BloodPressure') {
        if (p.accessType === 'read') {
          readPermissionsSet.add(
            'HKQuantityTypeIdentifierBloodPressureSystolic'
          );
          readPermissionsSet.add(
            'HKQuantityTypeIdentifierBloodPressureDiastolic'
          );
        } else if (p.accessType === 'write') {
          writePermissionsSet.add(
            'HKQuantityTypeIdentifierBloodPressureSystolic'
          );
          writePermissionsSet.add(
            'HKQuantityTypeIdentifierBloodPressureDiastolic'
          );
        }
      } else if (
        p.recordType === 'Workout' ||
        p.recordType === 'ExerciseSession'
      ) {
        if (p.accessType === 'read') {
          readPermissionsSet.add('HKWorkoutTypeIdentifier');
          // Workout telemetry is authorized per underlying type, not by the
          // workout: without these the route comes back empty and the
          // per-workout sample queries throw, so a synced walk would have no
          // map and no heart-rate chart. Requested alongside the workout itself
          // rather than as separate metrics because they are only ever read
          // scoped to a workout (see healthkit/workoutTelemetry.ts).
          WORKOUT_TELEMETRY_READ_IDENTIFIERS.forEach((identifier) =>
            readPermissionsSet.add(identifier)
          );
        } else if (p.accessType === 'write') {
          writePermissionsSet.add('HKWorkoutTypeIdentifier');
        }
      } else if (p.recordType === 'ActiveCaloriesBurned') {
        // The daily active figure can come from the Move ring (an account
        // setting, see activeEnergyByDay). The activity summary type is asked
        // for whether the setting is on or not, so the setting needs no
        // permission step of its own and a new phone already has it.
        if (p.accessType === 'read') {
          readPermissionsSet.add('HKQuantityTypeIdentifierActiveEnergyBurned');
          readPermissionsSet.add(ActivitySummaryTypeIdentifier);
        } else if (p.accessType === 'write') {
          writePermissionsSet.add('HKQuantityTypeIdentifierActiveEnergyBurned');
        }
      } else if (p.recordType === 'TotalCaloriesBurned') {
        // Total calories is derived from basal + active energy: the day-statistics
        // reader and the earliest-sample probe query both underlying types, so
        // authorization must cover both even when Active Calories is not itself an
        // enabled metric. Its active part can come from the Move ring like
        // Active Calories.
        if (p.accessType === 'read') {
          readPermissionsSet.add('HKQuantityTypeIdentifierBasalEnergyBurned');
          readPermissionsSet.add('HKQuantityTypeIdentifierActiveEnergyBurned');
          readPermissionsSet.add(ActivitySummaryTypeIdentifier);
        } else if (p.accessType === 'write') {
          writePermissionsSet.add('HKQuantityTypeIdentifierBasalEnergyBurned');
          writePermissionsSet.add('HKQuantityTypeIdentifierActiveEnergyBurned');
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
          DIETARY_WRITE_IDENTIFIERS.forEach((identifier) =>
            readPermissionsSet.add(identifier)
          );
        } else if (p.accessType === 'write') {
          DIETARY_WRITE_IDENTIFIERS.forEach((identifier) =>
            writePermissionsSet.add(identifier)
          );
        }
      } else if (SUPPORTED_HK_TYPES.has(healthkitIdentifier)) {
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

  return { toRead, toShare };
};

/**
 * Whether any of these permissions includes a HealthKit type the user has never been
 * asked about, e.g. one added to a metric in an app update. HealthKit only shows the
 * sheet for such types, so re-requesting when this is true is safe. An unknown status
 * or a failed check counts as true: a request with nothing new shows no sheet.
 */
export const hasUnrequestedHealthPermissions = async (
  permissions: PermissionRequest[]
): Promise<boolean> => {
  if (!isHealthKitAvailable) {
    return false;
  }
  const { toRead: allToRead, toShare } =
    healthKitAuthorizationTypes(permissions);
  // HealthKit keeps reporting the workout effort rating and the workout route
  // as never requested, so counting them would show the sheet on every visit.
  // They are still asked for with the rest whenever something else is
  // genuinely new.
  const toRead = allToRead.filter(
    (identifier) =>
      identifier !== WORKOUT_EFFORT_IDENTIFIER &&
      identifier !== 'HKWorkoutRouteTypeIdentifier'
  );
  if (toRead.length === 0 && toShare.length === 0) {
    return false;
  }
  try {
    const status = await getRequestStatusForAuthorization({
      toRead: toRead as Parameters<typeof requestAuthorization>[0]['toRead'],
      toShare: toShare as Parameters<typeof requestAuthorization>[0]['toShare'],
    });
    return status !== AuthorizationRequestStatus.unnecessary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthKitService] Failed to check HealthKit authorization status: ${message}`,
      'WARNING'
    );
    return true;
  }
};

export const requestHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<boolean> => {
  if (!isHealthKitAvailable) {
    Alert.alert(
      i18n.t('healthSync.alerts.healthAppUnavailableTitle', {
        defaultValue: 'Health App Not Available',
      }),
      i18n.t('healthSync.alerts.healthAppUnavailableMessage', {
        defaultValue:
          'Please install the Apple Health app to sync your health data.',
      })
    );
    return false;
  }

  const isSimulator =
    Platform.OS === 'ios' &&
    (Platform.constants as { simulator?: boolean })?.simulator === true;
  if (
    isSimulator &&
    !(globalThis as Record<string, unknown>).FORCE_HEALTHKIT_ON_SIM
  ) {
    // Returning true here is a convenience for simulator runs, but callers log it as
    // "permission granted" — say plainly that nothing was requested so the log is not
    // read as evidence that HealthKit was asked.
    addLog(
      '[HealthKitService] Simulator: skipped the authorization request entirely (no sheet, no grant). Set FORCE_HEALTHKIT_ON_SIM to exercise the real path.',
      'WARNING'
    );
    return true;
  }

  if (!permissionsToRequest || permissionsToRequest.length === 0) {
    return true;
  }

  const { toRead, toShare } = healthKitAuthorizationTypes(permissionsToRequest);

  if (toRead.length === 0 && toShare.length === 0) {
    // Every requested record type expanded to nothing — an unmapped record type, or one
    // missing from SUPPORTED_HK_TYPES. Nothing reaches HealthKit, so no sheet appears and
    // the type never shows up in the Health app, yet callers see success. Say so loudly.
    addLog(
      '[HealthKitService] Authorization request expanded to zero HealthKit types — nothing was requested.',
      'WARNING',
      permissionsToRequest.map(
        (p) => `unmapped: ${p.accessType} ${p.recordType}`
      )
    );
    return true;
  }

  // Exactly what we hand HealthKit, per direction. This is the record that separates
  // "the request never reached HealthKit" from "it did and the grant did not stick".
  addLog('[HealthKitService] Requesting HealthKit authorization', 'INFO', [
    `toRead (${toRead.length}): ${toRead.join(', ') || '(none)'}`,
    `toShare (${toShare.length}): ${toShare.join(', ') || '(none)'}`,
  ]);

  try {
    // HealthKit library expects 'toRead' and 'toShare' arrays
    await requestAuthorization({
      toRead: toRead as Parameters<typeof requestAuthorization>[0]['toRead'],
      toShare: toShare as Parameters<typeof requestAuthorization>[0]['toShare'],
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[HealthKitService] Failed to request permissions: ${message}`,
      'ERROR'
    );
    Alert.alert(
      i18n.t('healthSync.alerts.permissionErrorTitle', {
        defaultValue: 'Permission Error',
      }),
      i18n.t('healthSync.alerts.permissionErrorMessage', {
        defaultValue:
          'An unexpected error occurred while trying to request Health permissions: {{error}}',
        error: message,
      })
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
  unit?: string
): Promise<QueryStatisticsResponse[]> => {
  const now = new Date();
  const filterEnd = endDate.getTime() < now.getTime() ? endDate : now; // never query future dates
  const options: {
    filter: { date: { startDate: Date; endDate: Date } };
    unit?: string;
  } = {
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
    options
  );

  // Keep buckets that overlap [filterStart, filterEnd]:
  //  - the first bucket STARTS at the midnight before filterStart (partial first day — keep),
  //  - today's bucket ENDS at tomorrow's midnight (in-progress today — keep; a
  //    `bucket.endDate <= filterEnd` guard here would drop today's data on every sync).
  return buckets
    .filter(
      (bucket) =>
        bucket.startDate != null &&
        bucket.endDate != null &&
        new Date(bucket.endDate).getTime() > filterStart.getTime() &&
        new Date(bucket.startDate).getTime() <= filterEnd.getTime()
    )
    .sort(
      (a, b) =>
        new Date(a.startDate as Date).getTime() -
        new Date(b.startDate as Date).getTime()
    );
};

// Generic aggregation for cumulative HealthKit metrics. One statistics-collection query
// per metric; HealthKit handles cross-source deduplication.
const getAggregatedDataByDateDetailed = async (
  startDate: Date,
  endDate: Date,
  config: AggregationConfig
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog(
      `[HealthKitService] HealthKit not available for ${config.logLabel} aggregation`,
      'DEBUG'
    );
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(
      config.identifier,
      ['cumulativeSum'],
      startDate,
      endDate,
      config.unit
    );
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
    return {
      records: [],
      error: recordReadError(error, `Aggregated ${config.logLabel} query`),
    };
  }
};

export const getAggregatedStepsByDateDetailed = (
  startDate: Date,
  endDate: Date
) =>
  getAggregatedDataByDateDetailed(
    startDate,
    endDate,
    AGGREGATION_CONFIGS.steps
  );

export const getAggregatedStepsByDate = (startDate: Date, endDate: Date) =>
  getAggregatedStepsByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

/**
 * Move ring active energy per local day, the figure the Fitness app shows. A day
 * without a ring is left out: HealthKit answers a denied or not-yet-requested read
 * with no summaries rather than an error, and days before the person had a ring have
 * none, so those days keep the statistics sum.
 */
const queryMoveRingActiveByDay = async (
  filterStart: Date,
  endDate: Date
): Promise<Map<string, number>> => {
  const now = new Date();
  const filterEnd = endDate.getTime() < now.getTime() ? endDate : now;
  const summaries = await queryActivitySummary({
    date: { startDate: filterStart, endDate: filterEnd },
  });
  const firstDay = toLocalDateString(filterStart);
  const lastDay = toLocalDateString(filterEnd);
  const byDay = new Map<string, number>();
  for (const summary of summaries) {
    const { year, month, day } = summary.dateComponents;
    if (year == null || month == null || day == null) {
      continue;
    }
    // The components are in the device calendar, so a non-Gregorian year lands
    // outside the window and that day keeps the statistics sum.
    const date = toLocalDateString(new Date(year, month - 1, day));
    if (date < firstDay || date > lastDay) {
      continue;
    }
    byDay.set(date, summary.activeEnergyBurned.quantity);
  }
  return byDay;
};

// Active energy per local day: the statistics sum, as the Health app shows it, or,
// with useMoveRing (the account's use_move_ring_active_calories setting), the Move
// ring where the day has one. The two differ because Fitness credits only Apple
// devices while Health counts every source by its priority. Throws if either query
// fails.
const activeEnergyByDay = async (
  startDate: Date,
  endDate: Date,
  useMoveRing: boolean
): Promise<Map<string, number>> => {
  const [buckets, ring] = await Promise.all([
    queryDayStatistics(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      ['cumulativeSum'],
      startDate,
      endDate,
      'kcal'
    ),
    useMoveRing
      ? queryMoveRingActiveByDay(startDate, endDate)
      : new Map<string, number>(),
  ]);
  const byDay = new Map<string, number>();
  for (const bucket of buckets) {
    byDay.set(
      toLocalDateString(new Date(bucket.startDate as Date)),
      bucket.sumQuantity?.quantity ?? 0
    );
  }
  for (const [date, kcal] of ring) {
    // iPhone keeps a summary for every day, so a day spent with only another
    // brand's tracker has a 0 ring while Health has its calories.
    if (kcal > 0) {
      byDay.set(date, kcal);
    }
  }
  return byDay;
};

export const getAggregatedActiveCaloriesByDateDetailed = async (
  startDate: Date,
  endDate: Date,
  useMoveRing = false
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog(
      '[HealthKitService] HealthKit not available for calories aggregation',
      'DEBUG'
    );
    return { records: [] };
  }

  try {
    const byDay = await activeEnergyByDay(startDate, endDate, useMoveRing);
    const deviceTz = getDeviceTimezone();
    // YYYY-MM-DD keys sort lexicographically = chronologically.
    const records = Array.from(byDay.entries())
      .filter(([, kcal]) => kcal > 0)
      .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
      .map(([date, kcal]) => ({
        date,
        value: Math.round(kcal),
        type: 'active_calories',
        record_timezone: deviceTz,
      }));
    return { records };
  } catch (error) {
    return {
      records: [],
      error: recordReadError(error, 'Aggregated calories query'),
    };
  }
};

export const getAggregatedActiveCaloriesByDate = (
  startDate: Date,
  endDate: Date,
  useMoveRing = false
) =>
  getAggregatedActiveCaloriesByDateDetailed(
    startDate,
    endDate,
    useMoveRing
  ).then((result) => result.records);

export const getAggregatedDistanceByDateDetailed = (
  startDate: Date,
  endDate: Date
) =>
  getAggregatedDataByDateDetailed(
    startDate,
    endDate,
    AGGREGATION_CONFIGS.distance
  );

export const getAggregatedDistanceByDate = (startDate: Date, endDate: Date) =>
  getAggregatedDistanceByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

export const getAggregatedFloorsClimbedByDateDetailed = (
  startDate: Date,
  endDate: Date
) =>
  getAggregatedDataByDateDetailed(
    startDate,
    endDate,
    AGGREGATION_CONFIGS.floorsClimbed
  );

export const getAggregatedFloorsClimbedByDate = (
  startDate: Date,
  endDate: Date
) =>
  getAggregatedFloorsClimbedByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

// Total calories = Basal + Active energy summed per local day (active as in
// activeEnergyByDay), merged by day string. All-or-nothing: either query failing
// errors the whole metric (so the sync cursor holds) rather than silently
// under-reporting days.
export const getAggregatedTotalCaloriesByDateDetailed = async (
  startDate: Date,
  endDate: Date,
  useMoveRing = false
): Promise<HealthKitReadResult<AggregatedHealthRecord>> => {
  if (!isHealthKitAvailable) {
    addLog(
      '[HealthKitService] HealthKit not available for total calories aggregation',
      'DEBUG'
    );
    return { records: [] };
  }

  try {
    const [basalBuckets, activeByDay] = await Promise.all([
      queryDayStatistics(
        'HKQuantityTypeIdentifierBasalEnergyBurned',
        ['cumulativeSum'],
        startDate,
        endDate,
        'kcal'
      ),
      activeEnergyByDay(startDate, endDate, useMoveRing),
    ]);

    const totalsByDay = new Map<string, number>();
    const add = (day: string, kcal: number) => {
      if (kcal > 0) {
        totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + kcal);
      }
    };
    for (const bucket of basalBuckets) {
      add(
        toLocalDateString(new Date(bucket.startDate as Date)),
        bucket.sumQuantity?.quantity ?? 0
      );
    }
    for (const [day, kcal] of activeByDay) {
      add(day, kcal);
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
    return {
      records: [],
      error: recordReadError(error, 'Total calories query'),
    };
  }
};

export const getAggregatedTotalCaloriesByDate = (
  startDate: Date,
  endDate: Date,
  useMoveRing = false
) =>
  getAggregatedTotalCaloriesByDateDetailed(
    startDate,
    endDate,
    useMoveRing
  ).then((result) => result.records);

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
    addLog(
      '[HealthKitService] HealthKit not available for basal energy aggregation',
      'DEBUG'
    );
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      ['cumulativeSum'],
      startOfLocalDay(startDate),
      endDate,
      'kcal'
    );

    const startOfToday = startOfLocalDay(new Date());
    const deviceTz = getDeviceTimezone();
    const records: AggregatedHealthRecord[] = [];
    for (const bucket of buckets) {
      const bucketEnd = new Date(bucket.endDate as Date);
      // Complete days only: a bucket ends at local midnight of D+1, so any bucket ending
      // after start-of-today (or past the requested window) is a partial day — skip it.
      if (
        bucketEnd.getTime() > startOfToday.getTime() ||
        bucketEnd.getTime() > endDate.getTime()
      ) {
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

export const getAggregatedBasalEnergyByDate = (
  startDate: Date,
  endDate: Date
) =>
  getAggregatedBasalEnergyByDateDetailed(startDate, endDate).then(
    (result) => result.records
  );

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
  HeartRate: {
    identifier: 'HKQuantityTypeIdentifierHeartRate',
    statsUnit: 'count/min',
  },
  HeartRateVariabilitySDNN: {
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    statsUnit: 'ms',
  },
  RespiratoryRate: {
    identifier: 'HKQuantityTypeIdentifierRespiratoryRate',
    statsUnit: 'count/min',
  },
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
  endDate: Date
): Promise<HealthKitReadResult<TransformedRecord> | null> => {
  const spec = MIN_MAX_AVG_DAY_STATS[metric.recordType];
  if (!spec) return null;

  if (!isHealthKitAvailable) {
    addLog(
      `[HealthKitService] HealthKit not available for ${metric.recordType} day statistics`,
      'DEBUG'
    );
    return { records: [] };
  }

  try {
    const buckets = await queryDayStatistics(
      spec.identifier,
      ['discreteMin', 'discreteMax', 'discreteAverage'],
      startDate,
      endDate,
      spec.statsUnit
    );
    const records = mapDayStatisticsToMinMaxAvg(
      buckets,
      metric.type,
      metric.unit,
      HEALTHKIT_SOURCE,
      getDeviceTimezone(),
      spec.toValue
    );
    return { records };
  } catch (error) {
    return {
      records: [],
      error: recordReadError(
        error,
        `${metric.recordType} day statistics query`
      ),
    };
  }
};

// ============================================================================
// Record Handlers - modular handlers for different HealthKit record types
// ============================================================================

// Handler function signature for reading health records
type RecordHandler = (
  identifier: string,
  startDate: Date,
  endDate: Date,
  telemetry: TelemetryRunContext
) => Promise<unknown[]>;

// Filter helpers for date range checking. Every handler pushes the window into the
// native query (filter + limit: 0 = all in-window samples) instead of taking the most
// recent N samples across ALL history and post-filtering — a dense or old history would
// otherwise silently drop valid in-window records. The JS guards below are kept
// belt-and-suspenders: the native predicate matches on sample-interval overlap (right
// for sleep/workouts), while isInDateRange keeps point-sample semantics exact.
const isInDateRange = (
  recordDate: Date,
  startDate: Date,
  endDate: Date
): boolean => recordDate >= startDate && recordDate <= endDate;

const overlapsDateRange = (
  recordStart: Date,
  recordEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean => recordStart < rangeEnd && recordEnd > rangeStart;

// Handler for SleepSession records
const handleSleepSession: RecordHandler = async (
  identifier,
  startDate,
  endDate
) => {
  const samples = await queryCategorySamples(
    identifier as Parameters<typeof queryCategorySamples>[0],
    {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
    }
  );

  // Use overlap check to include sessions that span range boundaries
  // (e.g., overnight sleep starting before midnight, ending after)
  const filteredSamples = samples.filter((s) => {
    const recordStartDate = new Date(s.startDate);
    const recordEndDate = new Date(s.endDate);
    return overlapsDateRange(
      recordStartDate,
      recordEndDate,
      startDate,
      endDate
    );
  });

  return filteredSamples.map((s) => {
    // Normalize timezone: HealthKit exposes timezone as both metadata.HKTimeZone
    // and the flattened metadataTimeZone field. Ensure HKTimeZone is always set
    // so the aggregation layer can find it consistently.
    const rawMetadata = (s as unknown as { metadata?: Record<string, unknown> })
      .metadata;
    const flatTz = (s as unknown as { metadataTimeZone?: string })
      .metadataTimeZone;
    const metadata = rawMetadata
      ? {
          ...rawMetadata,
          ...(flatTz && !rawMetadata.HKTimeZone ? { HKTimeZone: flatTz } : {}),
        }
      : flatTz
        ? { HKTimeZone: flatTz }
        : undefined;

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
  const samples = await queryCategorySamples(
    identifier as Parameters<typeof queryCategorySamples>[0],
    {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
    }
  );

  const filteredSamples = samples.filter((s) => {
    const recordStartDate = new Date(s.startDate);
    return isInDateRange(recordStartDate, startDate, endDate);
  });

  return filteredSamples.map((s) => ({
    startTime: s.startDate,
    endTime: s.endDate,
    value: 1, // MindfulSession doesn't have a direct stress level, so we record its presence
  }));
};

// Handler for MindfulnessSession records. Unlike Stress (presence only), each
// sample keeps its uuid and source so the server can upsert it by id.
const handleMindfulnessSession: RecordHandler = async (
  identifier,
  startDate,
  endDate
) => {
  const samples = await queryCategorySamples(
    identifier as Parameters<typeof queryCategorySamples>[0],
    {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
    }
  );

  return samples
    .filter((s) => isInDateRange(new Date(s.startDate), startDate, endDate))
    .map((s) => {
      const sample = s as unknown as {
        uuid?: string;
        metadata?: Record<string, unknown>;
        metadataTimeZone?: string;
        sourceRevision?: { source?: { bundleIdentifier?: string } };
      };
      const flatTz = sample.metadataTimeZone;
      const metadata =
        sample.metadata || flatTz
          ? {
              ...sample.metadata,
              ...(flatTz && !sample.metadata?.HKTimeZone
                ? { HKTimeZone: flatTz }
                : {}),
            }
          : undefined;
      return {
        uuid: sample.uuid,
        startTime: s.startDate,
        endTime: s.endDate,
        metadata,
        sourceBundleId: sample.sourceRevision?.source?.bundleIdentifier,
      };
    });
};

// Handler for reproductive health category types
const handleReproductiveHealth: RecordHandler = async (
  identifier,
  startDate,
  endDate
) => {
  const samples = await queryCategorySamples(
    identifier as Parameters<typeof queryCategorySamples>[0],
    {
      ascending: false,
      limit: 0,
      filter: { date: { startDate, endDate } },
    }
  );

  const filteredSamples = samples.filter((s) => {
    const recordStartDate = new Date(s.startDate);
    return isInDateRange(recordStartDate, startDate, endDate);
  });

  return filteredSamples.map((s) => ({
    startTime: s.startDate,
    endTime: s.endDate,
    value: s.value, // Category value (enum integer)
  }));
};

// Handler for Workout/ExerciseSession records
const handleWorkout: RecordHandler = async (
  _identifier,
  startDate,
  endDate,
  telemetry
) => {
  const workouts = await queryWorkoutSamples({
    ascending: false,
    limit: 0,
    filter: { date: { startDate, endDate } },
  });

  // Use overlap check to include workouts that span range boundaries
  const filteredWorkouts = workouts.filter((w) => {
    const workoutStart = new Date(w.startDate);
    const workoutEnd = new Date(w.endDate);
    if (!overlapsDateRange(workoutStart, workoutEnd, startDate, endDate)) {
      return false;
    }
    // Drop our own watch sessions before they claim telemetry-budget slots.
    // The transformer still skips them as defense in depth.
    return !isOwnWatchWorkout(w as unknown as Record<string, unknown>);
  });

  // Budget slots are assigned in list order (the query is newest-first) before
  // the concurrent stats fetches start. Claiming inside the map would award
  // slots in Promise completion order — whichever workout's reads resolve
  // first — so a capped background run could spend its budget on old workouts
  // while the newest go unenriched.
  const ctx = telemetry;
  const telemetryAllowed = new Set<unknown>();
  const startedAtMs = Date.now();
  let skippedAlreadyCollected = 0;
  // A forced run re-reads cached sessions, so the cache no longer thins the
  // candidates and the budget alone decides. Taken newest-first that would
  // pick the same few every run and never reach the rest of the range, so
  // order by how long ago each was collected: never-collected first, then
  // least recently collected. Re-read sessions are re-committed to the back
  // of the cache, so the next forced run continues where this one stopped.
  const selectionOrder = ctx.force ? await enrichedSessionOrder() : null;
  const collectionRank = (workout: unknown): number => {
    const key = workoutCacheKey(workout);
    if (!key || !selectionOrder) return -1;
    return selectionOrder.get(key) ?? -1;
  };
  const candidates = selectionOrder
    ? [...filteredWorkouts].sort(
        (a, b) => collectionRank(a) - collectionRank(b)
      )
    : filteredWorkouts;
  for (const w of candidates) {
    // Already-collected workouts neither consume a slot nor get re-read, so a
    // bounded budget works through the backlog across syncs instead of
    // re-picking the same newest few every run (#2191). A forced run re-reads
    // them anyway — that is the user asking for exactly this window again.
    if (!ctx.force && (await hasEnrichedSession(workoutCacheKey(w)))) {
      skippedAlreadyCollected++;
      continue;
    }
    if (!ctx.claim()) break;
    telemetryAllowed.add(w);
  }

  // One read of the ratings covers every workout in the window.
  const effortSamples =
    filteredWorkouts.length > 0
      ? await readWorkoutEffortSamples(
          new Date(
            Math.min(
              ...filteredWorkouts.map((w) => new Date(w.startDate).getTime())
            )
          ),
          new Date(
            Math.max(
              ...filteredWorkouts.map((w) => new Date(w.endDate).getTime())
            )
          )
        )
      : [];

  // Fetch statistics (calories, distance) for each workout. Bounded fan-out:
  // each workout issues several statistics queries plus, when telemetry is
  // allowed, a route read and per-workout sample queries, and every result is
  // deserialized on the JS thread — an unbounded Promise.all over a wide
  // window converts that into one UI-starving burst (#2191).
  const settled = await runTasksInBatches(
    filteredWorkouts,
    AGGREGATE_CONCURRENCY,
    async (w) => {
      const workoutAny = w as unknown as {
        totalEnergyBurned?: number | { quantity?: number };
        totalDistance?: number | { quantity?: number };
      };

      // Start with direct properties from workout sample (fallback for older workouts).
      // The HealthKit library returns Quantity objects: { unit: string, quantity: number }
      let totalEnergyBurned =
        typeof workoutAny.totalEnergyBurned === 'object'
          ? (workoutAny.totalEnergyBurned?.quantity ?? 0)
          : (workoutAny.totalEnergyBurned ?? 0);
      let totalDistance =
        typeof workoutAny.totalDistance === 'object'
          ? (workoutAny.totalDistance?.quantity ?? 0)
          : (workoutAny.totalDistance ?? 0);
      let totalSteps: number | undefined;
      let totalFlights: number | undefined;
      let basalEnergyBurned: number | undefined;

      // Pin units explicitly on each getStatistic call. getAllStatistics returns
      // values in the user's HealthKit-preferred unit (often miles / kJ), but the
      // transform layer assumes meters / kcal, so we'd silently store mis-scaled
      // values otherwise.
      try {
        const energyStats = await w.getStatistic(
          'HKQuantityTypeIdentifierActiveEnergyBurned',
          'kcal'
        );
        if (energyStats?.sumQuantity?.quantity) {
          totalEnergyBurned = energyStats.sumQuantity.quantity;
        }

        // Resting/basal burn during the workout. Apple Fitness shows both
        // ("Active 57 CAL / Total 94 CAL"), and Total - Active is this value;
        // without it the app's Active/Resting tile can only render "57 / —".
        // Read through the same statistics(for:) path as active energy, so it
        // stays limited to samples HealthKit associates with this workout —
        // see the note on step count below for why a general clock-window
        // query is not substituted here.
        //
        // Isolated in its own try: basal energy is a separate HealthKit read
        // permission from active energy, so this call rejects outright on a
        // device where only active was granted. Inside the shared try that
        // would abandon the distance and step reads below it on every
        // workout, silently falling back to the coarser totals on the sample
        // — and distance feeds pace. Resting is optional; distance is not.
        try {
          const basalStats = await w.getStatistic(
            'HKQuantityTypeIdentifierBasalEnergyBurned',
            'kcal'
          );
          const basal = basalStats?.sumQuantity?.quantity;
          if (
            typeof basal === 'number' &&
            Number.isFinite(basal) &&
            basal > 0
          ) {
            basalEnergyBurned = basal;
          }
        } catch {
          // Not readable on this device; resting stays unreported.
        }

        // Floors climbed during the workout, which is what Apple Fitness shows
        // as "Flights Climbed" for a stair stepper. The workout sample's own
        // `totalFlightsClimbed` property is not filled in for workouts built
        // from statistics (a stair machine over GymKit, for one), so read it
        // the way steps are read below. Its own try: flights is a separate
        // read permission, and a refusal must not cost the distance and step
        // reads that follow.
        try {
          const flightStats = await w.getStatistic(
            'HKQuantityTypeIdentifierFlightsClimbed',
            'count'
          );
          const flights = flightStats?.sumQuantity?.quantity;
          if (
            typeof flights === 'number' &&
            Number.isFinite(flights) &&
            flights > 0
          ) {
            totalFlights = Math.round(flights);
          }
        } catch {
          // Not readable on this device; floors fall back to the sample property.
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

        // statistics(for:) only includes samples HealthKit associates with this
        // HKWorkout. Do not replace this with a general query over the same clock
        // window: that would turn incidental steps during strength training into
        // workout steps and incorrectly remove their background calorie credit.
        const stepStats = await w.getStatistic(
          'HKQuantityTypeIdentifierStepCount',
          'count'
        );
        const associatedSteps = stepStats?.sumQuantity?.quantity;
        if (
          typeof associatedSteps === 'number' &&
          Number.isFinite(associatedSteps) &&
          associatedSteps > 0
        ) {
          totalSteps = Math.round(associatedSteps);
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
      if (totalSteps !== undefined) record.totalSteps = totalSteps;
      // Forward timezone metadata so the transform layer can attach it to output records
      const tz = (w as unknown as { metadataTimeZone?: string })
        .metadataTimeZone;
      if (tz) {
        record.metadata = { HKTimeZone: tz };
      }

      // Forward the marker our own watch app stamps on workouts it saves, so
      // the transformer can skip them — the live-workout flow already logged
      // those sets in the diary, and importing the HealthKit copy would file
      // the same session twice. Forwarded key by key like the timezone above
      // rather than by spreading the whole metadata dictionary: the reader
      // here deliberately carries only what a transformer consumes.
      const watchSessionId = (
        w as unknown as { metadata?: Record<string, unknown> }
      ).metadata?.[WATCH_SESSION_METADATA_KEY];
      if (watchSessionId !== undefined) {
        record.metadata = {
          ...(record.metadata as Record<string, unknown> | undefined),
          [WATCH_SESSION_METADATA_KEY]: watchSessionId,
        };
      }

      // Tell a walk or run recorded on the watch alone (source bundle
      // `<phone-bundle>.watchkitapp`) from other apps' workouts, and whether
      // it was indoors, so the transformer can title it.
      const workoutExtras = w as unknown as {
        sourceRevision?: { source?: { bundleIdentifier?: string } };
        metadata?: Record<string, unknown>;
      };
      const workoutBundleId =
        workoutExtras.sourceRevision?.source?.bundleIdentifier;
      if (workoutBundleId) record.sourceBundleId = workoutBundleId;
      const indoorFlag = workoutExtras.metadata?.HKIndoorWorkout;
      if (indoorFlag !== undefined) {
        record.metadata = {
          ...(record.metadata as Record<string, unknown> | undefined),
          HKIndoorWorkout: indoorFlag,
        };
      }

      // Elevation is not a totals field on the workout; it arrives as metadata.
      const elevation = w as unknown as {
        metadataElevationAscended?: { quantity?: number };
        metadataElevationDescended?: { quantity?: number };
        totalFlightsClimbed?: { quantity?: number } | number;
        totalSwimmingStrokeCount?: { quantity?: number } | number;
      };
      const quantityOf = (v: { quantity?: number } | number | undefined) =>
        typeof v === 'object' ? v?.quantity : v;

      // These all come from the workout sample already loaded above — no route
      // read, no per-workout sample query — so they must not be gated behind the
      // telemetry budget below. Gating them too would mean every workout past the
      // budget on a backfill silently loses elevation/floors/strokes/elapsed time
      // as well, even though the budget exists only to cap the expensive reads.
      const telemetry: Record<string, number | null | undefined> = {};
      const effort = matchWorkoutEffort(effortSamples, w);
      if (effort != null) telemetry.workout_effort = effort;
      const gain = elevation.metadataElevationAscended?.quantity;
      const loss = elevation.metadataElevationDescended?.quantity;
      // The sample property when it carries a value, else the statistic read
      // above; a property of 0 is "not recorded", not "no floors".
      const propertyFloors = quantityOf(elevation.totalFlightsClimbed);
      const floors =
        typeof propertyFloors === 'number' && propertyFloors > 0
          ? propertyFloors
          : totalFlights;
      const strokes = quantityOf(elevation.totalSwimmingStrokeCount);
      if (typeof gain === 'number') telemetry.elevation_gain_meters = gain;
      if (typeof loss === 'number') telemetry.elevation_loss_meters = loss;
      if (typeof floors === 'number') telemetry.floors_climbed = floors;
      if (typeof strokes === 'number') telemetry.stroke_count = strokes;
      // w.duration is a Quantity ({ unit, quantity }), not a raw number — the
      // same shape totalEnergyBurned/totalDistance arrive in above.
      const durationSeconds = quantityOf(
        w.duration as { quantity?: number } | number | undefined
      );
      if (typeof durationSeconds === 'number') {
        telemetry.elapsed_time_seconds = Math.round(durationSeconds);
      }
      if (totalEnergyBurned) telemetry.active_calories = totalEnergyBurned;
      if (basalEnergyBurned !== undefined) {
        telemetry.resting_calories = basalEnergyBurned;
      }

      // Telemetry must be collected here, inside the closure that owns the live
      // proxy: the per-workout sample predicate takes the proxy object itself,
      // and the proxy cannot be carried out on the returned record.
      if (telemetryAllowed.has(w)) {
        const bundle = await limitTelemetry(() =>
          collectWorkoutTelemetry(
            w as unknown as WorkoutProxyLike,
            (
              w as unknown as {
                events?: readonly {
                  type: number;
                  startDate: Date;
                  endDate: Date;
                }[];
              }
            ).events
          )
        );
        if (bundle.gps_points) record.gps_points = bundle.gps_points;
        if (bundle.hr_samples) record.hr_samples = bundle.hr_samples;
        if (bundle.laps) record.laps = bundle.laps;
        Object.assign(telemetry, bundle.telemetry);
        // Recorded even when the workout had nothing beyond its summary: the
        // reads that established that are exactly what must not repeat. A bundle
        // that came back `incomplete` is a failed read, not an empty one, and is
        // left uncached so the next sync retries it.
        //
        // No grace window here, unlike Health Connect. The #2300 case is heart
        // rate written by another app and joined to the session by time overlap,
        // which HealthKit cannot express: collectWorkoutSeries queries
        // `filter: { workout }`, so a sample not associated with this workout is
        // invisible however often it is re-read. The two cases that do arrive
        // late are already covered — a workout still being written moves its
        // endDate and so its cache key, and a failed or locked read comes back
        // `incomplete`. Retrying here would cost every sync and buy nothing.
        if (!bundle.incomplete) ctx.stageCollected(workoutCacheKey(w));
      }

      if (Object.keys(telemetry).length > 0) record.telemetry = telemetry;

      return record;
    }
  );

  // Batching must not change failure semantics: Promise.all rejected the whole
  // read before, which surfaced as a metric error and held the sync cursor so
  // the window is retried. Dropping the failed workout instead would advance
  // the cursor past one we never actually read.
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure && failure.status === 'rejected') {
    addLog(
      `[HealthKitService] Workout enrichment failed: ${getErrorMessage(failure.reason)}`,
      'ERROR'
    );
    throw failure.reason;
  }

  const workoutsWithStats = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  );

  await attachAppleZoneGroups(workoutsWithStats);

  // One summary line per run — the field-verifiable signal for #2191. See the
  // matching log in healthconnect/index.ts.
  const overBudget =
    filteredWorkouts.length - skippedAlreadyCollected - telemetryAllowed.size;
  addLog(
    `[HealthKitService] Enriched ${filteredWorkouts.length} workout(s) in ${Date.now() - startedAtMs}ms ` +
      `(telemetry: ${telemetryAllowed.size}, already collected: ${skippedAlreadyCollected}, ` +
      `over budget: ${Math.max(overBudget, 0)})`,
    'INFO'
  );

  return workoutsWithStats;
};

/**
 * Copies Apple's heart-rate zone group onto each workout that has one.
 * Own-watch workouts are still skipped later by the transformer; this only
 * fills the field. A failure leaves the workout to be bucketed on the server.
 */
async function attachAppleZoneGroups(
  records: Record<string, unknown>[]
): Promise<void> {
  const uuids = records.flatMap((record) =>
    typeof record.uuid === 'string' && record.uuid.length > 0
      ? [record.uuid]
      : []
  );
  if (uuids.length === 0) return;
  const groups = await readAppleWorkoutZoneGroups(uuids);
  if (groups.size === 0) return;
  for (const record of records) {
    if (typeof record.uuid !== 'string') continue;
    const zones = groups.get(record.uuid.toLowerCase());
    if (zones) record.hr_zones = zones;
  }
}

// Handler for BloodPressure records (requires merging systolic and diastolic samples)
const handleBloodPressure: RecordHandler = async (
  _identifier,
  startDate,
  endDate
) => {
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

  const filteredSystolic = systolicSamples.filter((s) => {
    const sampleDate = new Date(s.startDate);
    return isInDateRange(sampleDate, startDate, endDate);
  });
  const filteredDiastolic = diastolicSamples.filter((s) => {
    const sampleDate = new Date(s.startDate);
    return isInDateRange(sampleDate, startDate, endDate);
  });

  // Merge systolic and diastolic readings by timestamp
  const bpMap = new Map<
    string,
    { systolic?: number; diastolic?: number; time: string }
  >();
  filteredSystolic.forEach((s) => {
    const timeStr =
      typeof s.startDate === 'string'
        ? s.startDate
        : new Date(s.startDate).toISOString();
    bpMap.set(timeStr, { systolic: s.quantity, time: timeStr });
  });
  filteredDiastolic.forEach((s) => {
    const timeStr =
      typeof s.startDate === 'string'
        ? s.startDate
        : new Date(s.startDate).toISOString();
    const existing = bpMap.get(timeStr);
    if (existing) existing.diastolic = s.quantity;
  });

  return Array.from(bpMap.values())
    .filter((r) => r.systolic && r.diastolic)
    .map((r) => ({
      systolic: { inMillimetersOfMercury: r.systolic },
      diastolic: { inMillimetersOfMercury: r.diastolic },
      time: r.time,
    }));
};

// Transform map for standard quantity types - maps recordType to output structure
const QUANTITY_TRANSFORMS: Record<
  string,
  (
    baseRecord: Record<string, unknown>,
    quantity: number
  ) => Record<string, unknown>
> = {
  Steps: (base) => base,
  ActiveCaloriesBurned: (base, q) => ({ ...base, energy: { inCalories: q } }),
  TotalCaloriesBurned: (base, q) => ({ ...base, energy: { inCalories: q } }),
  HeartRate: (base, q) => ({ ...base, samples: [{ beatsPerMinute: q }] }),
  Weight: (base, q) => ({ ...base, weight: { inKilograms: q } }),
  Height: (base, q) => ({ ...base, height: { inMeters: q } }),
  BodyFat: (base, q) => ({ ...base, percentage: { inPercent: q * 100 } }),
  BodyTemperature: (base, q) => ({ ...base, temperature: { inCelsius: q } }),
  BloodGlucose: (base, q) => ({
    ...base,
    level: { inMilligramsPerDeciliter: q },
  }),
  OxygenSaturation: (base, q) => ({
    ...base,
    percentage: { inPercent: q * 100 },
  }),
  BloodOxygenSaturation: (base, q) => ({
    ...base,
    percentage: { inPercent: q * 100 },
  }),
  Vo2Max: (base, q) => ({ ...base, vo2Max: q }),
  RestingHeartRate: (base, q) => ({ ...base, beatsPerMinute: q }),
  RespiratoryRate: (base, q) => ({ ...base, rate: q }),
  Distance: (base, q) => ({ ...base, distance: { inMeters: q } }),
  FloorsClimbed: (base, q) => ({ ...base, floors: q }),
  Hydration: (base, q) => ({ ...base, volume: { inLiters: q } }),
  LeanBodyMass: (base, q) => ({ ...base, mass: { inKilograms: q } }),
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

    const samples = await queryQuantitySamples(
      identifier as Parameters<typeof queryQuantitySamples>[0],
      queryOptions
    );

    if (!Array.isArray(samples)) {
      return [];
    }

    const filteredSamples = samples.filter((record) => {
      const recordDate = new Date(record.startDate);
      return isInDateRange(recordDate, startDate, endDate);
    });

    const transform =
      QUANTITY_TRANSFORMS[recordType] ||
      ((base: Record<string, unknown>) => base);

    return filteredSamples.map((s) => {
      const baseRecord: Record<string, unknown> = {
        startTime: s.startDate,
        endTime: s.endDate,
        time: s.startDate,
        value: s.quantity,
        // Origin app's bundle id, for the writeback feedback-loop guard (Hydration
        // transformer skips records this app wrote). Nested under sourceRevision.source
        // — there is no pre-flattened source field, so this path is read directly.
        sourceBundleId: (
          s as unknown as {
            sourceRevision?: { source?: { bundleIdentifier?: string } };
          }
        ).sourceRevision?.source?.bundleIdentifier,
        // Stable per-sample id, used by e.g. the Hydration transformer as
        // source_id for idempotent server-side upsert-by-record sync.
        uuid: (s as unknown as { uuid?: string }).uuid,
      };
      // Forward timezone metadata so the transform layer can attach it to output records
      const tz = (s as unknown as { metadataTimeZone?: string })
        .metadataTimeZone;
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

interface CorrelationEvent {
  bundleId: string;
  startTime: number;
  endTime: number;
  containedTypes: Set<string>;
}

// Reconstruct per-food entries from LOOSE dietary samples — those NOT contained in any Food
// correlation. A source's samples are grouped by event instant (one logged food = one shared
// timestamp). `correlationUuids` are the contained-sample UUIDs to skip so we never
// double-count nutrients that the correlation read already returned.
// `correlationEvents` are the source bundle + time window + contained nutrient types of all read
// correlations so loose samples from that same source and meal window are excluded if the correlation
// already provides that nutrient (preventing double-counting in apps like MacroFactor that emit
// both correlations and loose samples, while keeping distinct loose nutrients not in the correlation).
const readLooseNutrition = async (
  startDate: Date,
  endDate: Date,
  correlationUuids: Set<string>,
  correlationEvents: readonly CorrelationEvent[] = []
): Promise<Record<string, unknown>[]> => {
  const groups = new Map<string, LooseGroup>();
  // Filter to the window natively (limit: 0 = all in-window samples) instead of taking a
  // capped number of newest samples across all history and discarding out-of-window ones —
  // a large or old dietary history would otherwise silently drop valid in-window samples.
  const dateFilter = { date: { startDate, endDate } };

  for (const identifier of DIETARY_WRITE_IDENTIFIERS) {
    const samples = await queryQuantitySamples(
      identifier as Parameters<typeof queryQuantitySamples>[0],
      { filter: dateFilter, limit: 0, ascending: false }
    );
    if (!Array.isArray(samples)) continue;

    for (const s of samples) {
      const sample = s as unknown as {
        uuid?: string;
        startDate: string | Date;
        endDate?: string | Date;
        quantity: number;
        unit: string;
        metadataTimeZone?: string;
        metadata?: {
          HKTimeZone?: string;
          timeZone?: string;
          [key: string]: unknown;
        };
        sourceRevision?: { source?: { bundleIdentifier?: string } };
      };
      if (!isInDateRange(new Date(sample.startDate), startDate, endDate))
        continue;
      if (sample.uuid && correlationUuids.has(sample.uuid)) continue; // already in a correlation

      const bundleId = sample.sourceRevision?.source?.bundleIdentifier;
      const sampleStartMs = new Date(sample.startDate).getTime();
      if (Number.isNaN(sampleStartMs)) continue;
      const sampleEndMsRaw = sample.endDate
        ? new Date(sample.endDate).getTime()
        : sampleStartMs;
      const sampleEndMs = Number.isNaN(sampleEndMsRaw)
        ? sampleStartMs
        : sampleEndMsRaw;

      // Skip loose samples matching a correlation from the same source bundle in the same
      // event window that already contains this nutrient type (prevents double-counting
      // nutrients while preserving distinct nutrients not included in the correlation).
      if (
        bundleId &&
        correlationEvents.some(
          (event) =>
            event.bundleId === bundleId &&
            event.containedTypes.has(identifier) &&
            sampleStartMs <= event.endTime + 1000 &&
            sampleEndMs >= event.startTime - 1000
        )
      ) {
        continue;
      }

      const startIso = toIsoString(sample.startDate);
      const key = `${bundleId ?? 'unknown'}|${startIso}`;

      const sampleTz =
        (typeof sample.metadata?.HKTimeZone === 'string'
          ? sample.metadata.HKTimeZone
          : undefined) ||
        (typeof sample.metadata?.timeZone === 'string'
          ? sample.metadata.timeZone
          : undefined) ||
        sample.metadataTimeZone;

      let group = groups.get(key);
      if (!group) {
        group = {
          bundleId,
          startIso,
          timeZone: sampleTz,
          objects: [],
        };
        groups.set(key, group);
      } else if (!group.timeZone && sampleTz) {
        group.timeZone = sampleTz;
      }
      group.objects.push({
        quantityType: identifier,
        quantity: sample.quantity,
        unit: sample.unit,
      });
    }
  }

  // Loose samples carry no food name (the source's display name is unreachable — Nitro's
  // SourceProxy shadows it), so leave foodLabel unset; the transformer falls back to
  // "Apple Health food", matching Health Connect's "Health Connect food" parity.
  return Array.from(groups.values()).map((group) =>
    toNutritionRecord({
      objects: group.objects,
      // Synthetic but stable idempotency key: same source + instant re-reads to the same
      // entry, so re-syncing upserts in place (server keys on (user, source, source_id)).
      uuid: `${group.bundleId ?? 'unknown'}:${group.startIso}`,
      startIso: group.startIso,
      sourceBundleId: group.bundleId,
      timeZone: group.timeZone,
    })
  );
};

const handleNutrition: RecordHandler = async (
  _identifier,
  startDate,
  endDate
) => {
  // Filter to the window natively (limit: 0 = all in-window correlations) instead of taking
  // a capped number of newest ones across all history and discarding out-of-window ones — a
  // large or old food history would otherwise silently drop valid in-window correlations.
  const dateFilter = { date: { startDate, endDate } };

  // 1. Named Food correlations (e.g. LoseIt). Collect contained-sample UUIDs and correlation
  //    event windows so the loose read below doesn't double-count the same nutrients.
  const correlations = await queryCorrelationSamples(
    'HKCorrelationTypeIdentifierFood',
    {
      filter: dateFilter,
      limit: 0,
      ascending: false,
    }
  );
  // Belt-and-suspenders alongside the native filter: keep the exact [startDate, endDate]
  // guard in JS since the native predicate matches on sample-interval overlap.
  const inRange = correlations.filter((c) =>
    isInDateRange(new Date(c.startDate), startDate, endDate)
  );

  const correlationUuids = new Set<string>();
  const correlationEvents: CorrelationEvent[] = [];
  const correlationRecords = inRange.map((c) => {
    const correlation = c as unknown as {
      uuid?: string;
      startDate: string | Date;
      endDate?: string | Date;
      metadataFoodType?: string;
      metadataTimeZone?: string;
      metadata?: {
        HKFoodType?: string;
        foodType?: string;
        HKTimeZone?: string;
        timeZone?: string;
        [key: string]: unknown;
      };
      sourceRevision?: { source?: { bundleIdentifier?: string } };
      objects?: {
        uuid?: string;
        quantityType?: string;
        quantity?: number;
        unit?: string;
      }[];
    };
    const objects = correlation.objects ?? [];
    for (const o of objects) {
      if (o.uuid) correlationUuids.add(o.uuid);
    }

    const bundleId = correlation.sourceRevision?.source?.bundleIdentifier;
    if (bundleId && objects.length > 0) {
      const startMs = new Date(correlation.startDate).getTime();
      const endMs = correlation.endDate
        ? new Date(correlation.endDate).getTime()
        : startMs;
      if (!Number.isNaN(startMs)) {
        const containedTypes = new Set<string>();
        for (const o of objects) {
          if (o.quantityType) {
            containedTypes.add(o.quantityType);
          }
        }
        correlationEvents.push({
          bundleId,
          startTime: Math.min(startMs, Number.isNaN(endMs) ? startMs : endMs),
          endTime: Math.max(startMs, Number.isNaN(endMs) ? startMs : endMs),
          containedTypes,
        });
      }
    }

    const foodLabel =
      (typeof correlation.metadata?.HKFoodType === 'string'
        ? correlation.metadata.HKFoodType
        : undefined) ||
      (typeof correlation.metadata?.foodType === 'string'
        ? correlation.metadata.foodType
        : undefined) ||
      correlation.metadataFoodType;

    const timeZone =
      (typeof correlation.metadata?.HKTimeZone === 'string'
        ? correlation.metadata.HKTimeZone
        : undefined) ||
      (typeof correlation.metadata?.timeZone === 'string'
        ? correlation.metadata.timeZone
        : undefined) ||
      correlation.metadataTimeZone;

    return toNutritionRecord({
      objects: objects.map((o) => ({
        quantityType: o.quantityType,
        quantity: o.quantity,
        unit: o.unit,
      })),
      foodLabel,
      uuid: correlation.uuid,
      startIso: toIsoString(correlation.startDate),
      sourceBundleId: bundleId,
      timeZone,
    });
  });

  // 2. Loose per-nutrient samples (Cronometer, MyFitnessPal), grouped into per-food entries.
  const looseRecords = await readLooseNutrition(
    startDate,
    endDate,
    correlationUuids,
    correlationEvents
  );

  return [...correlationRecords, ...looseRecords];
};

// Registry mapping record types to their handlers
const RECORD_HANDLERS: Record<string, RecordHandler> = {
  SleepSession: handleSleepSession,
  Stress: handleStress,
  MindfulnessSession: handleMindfulnessSession,
  IntermenstrualBleeding: handleReproductiveHealth,
  MenstruationFlow: handleReproductiveHealth,
  OvulationTest: handleReproductiveHealth,
  CervicalMucus: handleReproductiveHealth,
  Workout: handleWorkout,
  ExerciseSession: handleWorkout,
  BloodPressure: handleBloodPressure,
  Nutrition: handleNutrition,
};

// Read health records from HealthKit. A failed read returns an error envelope so
// callers can surface it (and hold the sync cursor) instead of seeing an empty read.
export const readHealthRecordsDetailed = async (
  recordType: string,
  startDate: Date,
  endDate: Date,
  telemetry: TelemetryRunContext
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
    const handler =
      RECORD_HANDLERS[recordType] || createQuantityHandler(recordType);
    return {
      records: await handler(identifier, startDate, endDate, telemetry),
    };
  } catch (error) {
    return { records: [], error: recordReadError(error, `${recordType} read`) };
  }
};

/**
 * Read-only convenience wrapper for display and diagnostics paths.
 *
 * Pinned to a zero budget and non-interactive: these callers only render values,
 * so they must never spend per-workout telemetry reads or raise a route-consent
 * dialog. The sync engine uses readHealthRecordsDetailed directly and supplies
 * its own run context.
 */
export const readHealthRecords = (
  recordType: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> =>
  readHealthRecordsDetailed(
    recordType,
    startDate,
    endDate,
    createTelemetryRunContext({ budget: 0, interactive: false })
  ).then((result) => result.records);

// ============================================================================
// Earliest-sample probes (history-import floor detection)
// ============================================================================

// Probes read from the 1970 epoch: backdated manual entries and third-party
// imports can predate any "reasonable" floor, and the wider window costs nothing.
const PROBE_EPOCH = new Date(0);

const probeQuantityEarliest = async (
  identifier: string,
  now: Date
): Promise<Date | null> => {
  const samples = await queryQuantitySamples(
    identifier as Parameters<typeof queryQuantitySamples>[0],
    {
      ascending: true,
      limit: 1,
      filter: { date: { startDate: PROBE_EPOCH, endDate: now } },
    }
  );
  const sample = Array.isArray(samples) ? samples[0] : undefined;
  return sample ? new Date(sample.startDate) : null;
};

const probeCategoryEarliest = async (
  identifier: string,
  now: Date
): Promise<Date | null> => {
  const samples = await queryCategorySamples(
    identifier as Parameters<typeof queryCategorySamples>[0],
    {
      ascending: true,
      limit: 1,
      filter: { date: { startDate: PROBE_EPOCH, endDate: now } },
    }
  );
  const sample = Array.isArray(samples) ? samples[0] : undefined;
  return sample ? new Date(sample.startDate) : null;
};

const probeWorkoutEarliest = async (now: Date): Promise<Date | null> => {
  const workouts = await queryWorkoutSamples({
    ascending: true,
    limit: 1,
    filter: { date: { startDate: PROBE_EPOCH, endDate: now } },
  });
  const workout = Array.isArray(workouts) ? workouts[0] : undefined;
  return workout ? new Date(workout.startDate) : null;
};

const CATEGORY_PROBE_TYPES = new Set([
  'SleepSession',
  'Stress',
  'MindfulnessSession',
  'IntermenstrualBleeding',
  'MenstruationFlow',
  'OvulationTest',
  'CervicalMucus',
]);

const WORKOUT_PROBE_TYPES = new Set(['Workout', 'ExerciseSession']);

const minDate = (dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>(
    (earliest, date) =>
      date && (!earliest || date < earliest) ? date : earliest,
    null
  );

// Routed by record kind, mirroring RECORD_HANDLERS. Multi-identifier metrics take
// the min over the SAME identifiers their reader reads, so the probe can never
// claim less history than the reader would find.
const probeEarliestSample = async (
  recordType: string,
  now: Date
): Promise<Date | null> => {
  if (WORKOUT_PROBE_TYPES.has(recordType)) {
    return probeWorkoutEarliest(now);
  }
  if (CATEGORY_PROBE_TYPES.has(recordType)) {
    const identifier = HEALTHKIT_TYPE_MAP[recordType];
    return identifier ? probeCategoryEarliest(identifier, now) : null;
  }
  if (recordType === 'BloodPressure') {
    return probeQuantityEarliest(
      'HKQuantityTypeIdentifierBloodPressureSystolic',
      now
    );
  }
  if (recordType === 'TotalCaloriesBurned') {
    const [basal, active] = await Promise.all([
      probeQuantityEarliest('HKQuantityTypeIdentifierBasalEnergyBurned', now),
      probeQuantityEarliest('HKQuantityTypeIdentifierActiveEnergyBurned', now),
    ]);
    return minDate([basal, active]);
  }
  if (recordType === 'Nutrition') {
    // Nutrient-only entries with no energy value must still move the floor, so
    // every dietary identifier the nutrition reader covers is probed (iOS has no
    // read quota; a dozen limit-1 probes are free).
    const dates: (Date | null)[] = [];
    for (const identifier of DIETARY_WRITE_IDENTIFIERS) {
      dates.push(await probeQuantityEarliest(identifier, now));
    }
    return minDate(dates);
  }
  const identifier = HEALTHKIT_TYPE_MAP[recordType];
  if (!identifier || !SUPPORTED_HK_TYPES.has(identifier)) {
    return null;
  }
  return probeQuantityEarliest(identifier, now);
};

/**
 * Earliest stored sample for a record type across all history. No data =
 * { records: [] }; failures go through recordReadError so locked-device probes
 * bump the database-inaccessible counter.
 */
export const readEarliestSampleDetailed = async (
  recordType: string
): Promise<HealthKitReadResult<{ startTime: string }>> => {
  if (!isHealthKitAvailable) {
    return { records: [] };
  }

  try {
    const earliest = await probeEarliestSample(recordType, new Date());
    return earliest
      ? { records: [{ startTime: earliest.toISOString() }] }
      : { records: [] };
  } catch (error) {
    return {
      records: [],
      error: recordReadError(error, `${recordType} earliest-sample probe`),
    };
  }
};
