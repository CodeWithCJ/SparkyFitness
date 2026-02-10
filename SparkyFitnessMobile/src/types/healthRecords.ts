import { HealthMetric } from '../HealthMetrics';
import { SleepStageEvent } from './mobileHealthData';

// ==========================================
// RAW INPUT TYPES (for aggregation functions)
// ==========================================

/** Heart rate record from Health Connect */
export interface HCHeartRateRecord {
  startTime: string;
  samples: { beatsPerMinute: number }[];
}

/** Heart rate record from HealthKit */
export interface HKHeartRateRecord {
  startTime: string;
  samples: { beatsPerMinute: number }[];
}

/** Steps record from Health Connect */
export interface HCStepsRecord {
  startTime: string;
  endTime?: string;
  count: number;
}

/** Energy record (calories) from Health Connect */
export interface HCEnergyRecord {
  startTime: string;
  endTime?: string;
  energy: {
    inCalories?: number;
    inKilocalories?: number;
  };
}

/** Sleep record from HealthKit - used as input to aggregateSleepSessions */
export interface HKSleepRecord {
  startTime: string;
  endTime: string;
  value: string | number;
}

// ==========================================
// INTERNAL ACCUMULATOR TYPES
// ==========================================

/** Internal accumulator for heart rate aggregation */
export interface HeartRateAccumulator {
  [date: string]: { total: number; count: number };
}

/** Internal accumulator for step/calorie aggregation */
export interface SumAccumulator {
  [date: string]: number;
}

/** Sleep stage type including 'in_bed' */
export type SleepStageType = 'awake' | 'rem' | 'light' | 'deep' | 'in_bed' | 'unknown';

/** Internal session state during sleep aggregation (uses Date objects) */
export interface SleepSessionAccumulator {
  bedtime: Date;
  wake_time: Date;
  stage_events: SleepStageEvent[];
  total_duration_in_seconds: number;
  total_time_asleep_in_seconds: number;
  deep_sleep_seconds: number;
  light_sleep_seconds: number;
  rem_sleep_seconds: number;
  awake_sleep_seconds: number;
}

// ==========================================
// AGGREGATED OUTPUT TYPES
// ==========================================

/** Standard aggregated health data entry */
export interface AggregatedHealthRecord {
  date: string;
  value: number;
  type: string;
}

/** Sleep session output (complex structure) */
export interface AggregatedSleepSession {
  type: 'SleepSession';
  source: 'HealthKit' | 'Health Connect';
  timestamp: string;
  entry_date: string;
  bedtime: string;
  wake_time: string;
  duration_in_seconds: number;
  time_asleep_in_seconds: number;
  deep_sleep_seconds: number;
  light_sleep_seconds: number;
  rem_sleep_seconds: number;
  awake_sleep_seconds: number;
  stage_events: SleepStageEvent[];
  sleep_score?: number;
}

/** Exercise session output (complex structure) */
export interface TransformedExerciseSession {
  type: 'ExerciseSession';
  source: 'HealthKit' | 'Health Connect';
  date: string;
  entry_date: string;
  timestamp: string;
  startTime: string;
  endTime: string;
  duration: number;
  activityType: string;
  title: string;
  caloriesBurned?: number;
  distance?: number;
  notes?: string;
  raw_data?: unknown;
}

// ==========================================
// CONFIGURATION TYPES
// ==========================================

/**
 * Configuration passed to transform functions
 * Reuses HealthMetric fields instead of duplicating
 */
export type MetricConfig = Pick<HealthMetric, 'recordType' | 'unit' | 'type'>;

/** Simple transformed record for API */
export interface TransformedRecord {
  value: number;
  type: string;
  date: string;
  unit: string;
}

/** Union type for all possible transform outputs */
export type TransformOutput =
  | TransformedRecord
  | AggregatedSleepSession
  | TransformedExerciseSession;

// ==========================================
// SYNC RESULT TYPES (Phase 5)
// ==========================================

/** Individual sync error for a specific metric type */
export interface SyncError {
  type: string;
  error: string;
}

/**
 * Result returned from syncHealthData functions.
 * @example
 * const result = await syncHealthData('24h', metrics);
 * if (!result.success) {
 *   console.error(result.error);
 *   result.syncErrors.forEach(e => console.error(`${e.type}: ${e.error}`));
 * }
 */
export interface SyncResult {
  success: boolean;
  apiResponse?: unknown;
  error?: string;
  message?: string;
  syncErrors: SyncError[];
}

/**
 * Map of health metric state keys to enabled status.
 *
 * NOTE: Uses index signature for flexibility. Keys are defined by
 * HealthMetric.stateKey (e.g., 'isStepsSyncEnabled', 'isCaloriesSyncEnabled').
 * Could be tightened to a mapped type if stateKey becomes a string literal union.
 */
export interface HealthMetricStates {
  [stateKey: string]: boolean;
}

// ==========================================
// PERMISSION TYPES (Phase 5)
// ==========================================

/** Permission request structure for health data access */
export interface PermissionRequest {
  accessType: 'read' | 'write';
  recordType: string;
}

/** Granted permission from Health Connect */
export interface GrantedPermission {
  accessType: 'read' | 'write';
  recordType: string;
}

// ==========================================
// DISPLAY TYPES (Phase 6)
// ==========================================

/** Display values for health metrics (formatted strings) */
export interface HealthDataDisplayState {
  [metricId: string]: string;
}
