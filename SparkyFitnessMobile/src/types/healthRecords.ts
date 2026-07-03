import { HealthMetric } from '../HealthMetrics';
import { SleepStageEvent } from './mobileHealthData';
import type { RecordSyncError } from '../services/api/healthDataApi';

// ==========================================
// RAW INPUT TYPES (for aggregation functions)
// ==========================================

export const HEALTH_CONNECT_SOURCE = 'Health Connect' as const;
export const HEALTHKIT_SOURCE = 'HealthKit' as const;

/** Zone offset from Health Connect (e.g. { totalSeconds: 32400 } for UTC+9) */
export interface HCZoneOffset {
  totalSeconds: number;
}

/** Sleep record from HealthKit - used as input to aggregateSleepSessions */
export interface HKSleepRecord {
  startTime: string;
  endTime: string;
  value: string | number;
  /** HealthKit metadata forwarded from the reader layer (may contain HKTimeZone) */
  metadata?: { HKTimeZone?: string; [key: string]: unknown };
}

// ==========================================
// INTERNAL ACCUMULATOR TYPES
// ==========================================

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
  /** IANA timezone from the sample that set wake_time (for server-side day derivation) */
  record_timezone?: string;
}

// ==========================================
// AGGREGATED OUTPUT TYPES
// ==========================================

/** Optional per-record timezone metadata for server-side day derivation */
export interface RecordTimezoneMetadata {
  /** IANA timezone when available (best source for HealthKit) */
  record_timezone?: string | null;
  /** Fixed UTC offset in minutes (best fallback for Health Connect) */
  record_utc_offset_minutes?: number | null;
}

/** Standard aggregated health data entry */
export interface AggregatedHealthRecord extends RecordTimezoneMetadata {
  date: string;
  value: number;
  type: string;
}

/** Sleep session output (complex structure) */
export interface AggregatedSleepSession extends RecordTimezoneMetadata {
  type: 'SleepSession';
  source: typeof HEALTHKIT_SOURCE | typeof HEALTH_CONNECT_SOURCE;
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

/** Exercise set within a session (matches server API spec) */
export interface ExerciseSet {
  set_number: number;
  set_type?: string;
  reps?: number;
  weight?: number;
  duration?: number;    // minutes
  rest_time?: number;   // seconds
  notes?: string;
  rpe?: number;
}

/** Exercise session output (complex structure) */
export interface TransformedExerciseSession extends RecordTimezoneMetadata {
  type: 'ExerciseSession';
  source: typeof HEALTHKIT_SOURCE | typeof HEALTH_CONNECT_SOURCE;
  date: string;
  entry_date: string;
  timestamp: string;
  startTime: string;
  endTime: string;
  duration: number;
  activityType: string;
  title: string;
  caloriesBurned?: number;
  /** Stored in kilometers to match exercise entry API/storage. */
  distance?: number;
  notes?: string;
  raw_data?: unknown;
  sets?: ExerciseSet[];
  source_id?: string;
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
export interface TransformedRecord extends RecordTimezoneMetadata {
  value: number;
  type: string;
  date: string;
  unit: string;
  source: string;
}

/** Sparky meal type slug derived from Health Connect MealType constant */
export type SparkyMealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

/**
 * Nutrition entry output (one per Health Connect NutritionRecord).
 *
 * Maps an HC NutritionRecord (a single eaten item with a name, meal type and
 * nutrients) to a structure the server ingests as a food entry. Energy is in
 * kcal; nutrients are converted from HC's grams to each Sparky column's unit
 * (g for macros, mg/mcg for micros — see HC_NUTRIENT_COLUMNS).
 */
export interface TransformedNutritionEntry extends RecordTimezoneMetadata {
  type: 'Nutrition';
  source: typeof HEALTHKIT_SOURCE | typeof HEALTH_CONNECT_SOURCE;
  /** Stable Health Connect record id, used for idempotent re-sync. */
  source_id?: string;
  /** Instant the food was consumed; the server derives the day from this + offset. */
  timestamp: string;
  food_name: string;
  meal_type: SparkyMealType;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
}

/** Union type for all possible transform outputs */
export type TransformOutput =
  | TransformedRecord
  | AggregatedSleepSession
  | TransformedExerciseSession
  | TransformedNutritionEntry;

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
  /**
   * Per-record rejections reported by the server during upload. Deliberately
   * separate from syncErrors (read failures): upload rejections never suppress
   * saving the sync cursor, so a poison record cannot cause a re-sync loop.
   */
  uploadErrors?: RecordSyncError[];
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
