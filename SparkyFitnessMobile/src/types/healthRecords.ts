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

/** Sleep stage type including 'in_bed' (the output shape stored in stage_events) */
export type SleepStageType =
  'awake' | 'rem' | 'light' | 'deep' | 'in_bed' | 'unknown';

/**
 * Internal sleep stage classification used only during HealthKit overlap resolution.
 * Splits Apple-Watch 'core' from generic 'asleep' so 'awake' can rank between them
 * (the common Watch-vs-AutoSleep conflict is Watch=awake vs AutoSleep=generic-asleep,
 * where the Watch's awake must win). Both 'core' and 'asleep_generic' map to the same
 * output 'light' stage. See mapHealthKitSleepStage / SLEEP_STAGE_RANK in dataAggregation.ts.
 */
export type InternalSleepStage =
  'deep' | 'rem' | 'core' | 'awake' | 'asleep_generic' | 'in_bed' | 'unknown';

/** One raw HealthKit sleep sample collected before overlap resolution (uses epoch ms). */
export interface SleepRawEvent {
  startMs: number;
  endMs: number;
  internalStage: InternalSleepStage;
  /** Priority for overlap resolution; higher wins. Derived from SLEEP_STAGE_RANK. */
  rank: number;
}

/**
 * Internal session state during sleep aggregation (uses Date objects).
 * Collects raw, possibly-overlapping samples from all HealthKit sources; the
 * non-overlapping timeline and per-stage buckets are derived in finalizeSession.
 */
export interface SleepSessionAccumulator {
  bedtime: Date;
  wake_time: Date;
  raw_events: SleepRawEvent[];
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
  /** Instant when this cumulative snapshot was read from the health provider. */
  timestamp?: string;
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
  // Explicitly unit-suffixed so servers without the seconds-based set model
  // drop the field instead of misreading it (legacy `duration` was minutes).
  duration_seconds?: number;
  rest_time?: number; // seconds
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
  /** Steps explicitly associated with this workout by the health provider. */
  steps?: number;
  notes?: string;
  raw_data?: unknown;
  sets?: ExerciseSet[];
  source_id?: string;
  /**
   * Wearable telemetry (X-Workout-Model-Version 3+). All optional so an older
   * server drops the fields it does not know, and a newer server still accepts
   * a session from an older app that sends none of them.
   */
  gps_points?: WorkoutGpsPoint[];
  hr_samples?: WorkoutHrSample[];
  laps?: WorkoutLapWindow[];
  telemetry?: WorkoutTelemetry;
}

/**
 * One GPS trackpoint. Short keys because a long activity carries thousands of
 * these and the field names would otherwise dominate the payload; they match
 * the JSONB shape the server stores in exercise_entry_gps_points.
 */
export interface WorkoutGpsPoint {
  /** ISO 8601 instant. */
  t: string;
  lat: number;
  lon: number;
  /** Metres. */
  alt?: number | null;
  /** Metres per second. */
  speed?: number | null;
  hr?: number | null;
  cad?: number | null;
  /** Watts. */
  power?: number | null;
  /** Cumulative METRES (the session-level `distance` above is kilometres). */
  dist?: number | null;
  /** Horizontal accuracy, metres. */
  hacc?: number | null;
  /** Vertical accuracy, metres. */
  vacc?: number | null;
  /** Degrees. */
  course?: number | null;
}

export interface WorkoutHrSample {
  t: string;
  bpm: number;
}

/**
 * A lap boundary. Only the window is sent: the server derives distance, heart
 * rate, speed, cadence, power and elevation for each lap from the series, so
 * that aggregation lives in one place rather than once per platform.
 */
export interface WorkoutLapWindow {
  /** 1-based. */
  lap_index: number;
  start_time: string;
  end_time: string;
}

/**
 * Whole-session summary values. Keys are deliberately the exercise_entries
 * column names so the server can apply them without a mapping table. Anything
 * omitted is derived server-side from the series where possible.
 */
export interface WorkoutTelemetry {
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  /** Metres per second. */
  avg_speed_mps?: number | null;
  max_speed_mps?: number | null;
  avg_moving_speed_mps?: number | null;
  avg_cadence?: number | null;
  max_cadence?: number | null;
  avg_power_watts?: number | null;
  max_power_watts?: number | null;
  /** Metres. */
  elevation_gain_meters?: number | null;
  elevation_loss_meters?: number | null;
  min_elevation_meters?: number | null;
  max_elevation_meters?: number | null;
  floors_climbed?: number | null;
  stroke_count?: number | null;
  moving_time_seconds?: number | null;
  elapsed_time_seconds?: number | null;
  active_calories?: number | null;
  /** Milliseconds. */
  ground_contact_time_ms?: number | null;
  /** Millimetres. */
  vertical_oscillation_mm?: number | null;
  /** Centimetres. */
  stride_length_cm?: number | null;
}

// ==========================================
// CONFIGURATION TYPES
// ==========================================

/**
 * Configuration passed to transform functions
 * Reuses HealthMetric fields instead of duplicating
 */
export type MetricConfig = Pick<HealthMetric, 'recordType' | 'unit' | 'type'>;

/**
 * Platform-neutral read envelope. Read failures return the error alongside any
 * partially collected records instead of throwing, so callers can surface the
 * error (holding the sync cursor) while still syncing what was read.
 */
export interface ReadResult<T = unknown> {
  records: T[];
  error?: string;
}

/** Simple transformed record for API */
export interface TransformedRecord extends RecordTimezoneMetadata {
  value: number;
  type: string;
  date: string;
  unit: string;
  source: string;
  timestamp?: string;
  source_id?: string;
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
