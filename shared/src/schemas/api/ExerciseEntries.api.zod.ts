import { z } from 'zod';
import { paginationSchema } from './Pagination.api.zod.ts';
import { exerciseModalitySchema } from './Exercises.api.zod.ts';
import { workoutFormatSchema } from './WorkoutPresets.api.zod.ts';
import { gpsTrackPointSchema } from '../database/ExerciseEntryGpsPoints.zod.ts';
import { CALORIE_LINK_RESOLUTIONS } from '../../utils/exerciseCalorieLink.ts';

export const calorieLinkResolutionSchema = z.enum(CALORIE_LINK_RESOLUTIONS);

// --- Query contracts ---

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry date must be in YYYY-MM-DD format.');

const timeStringSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    'Entry time must be in HH:MM (24h) format.'
  );

/** Query params for the paginated exercise history endpoint */
export const exerciseHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().uuid().optional(),
    /** Only sessions containing this exercise (standalone entries or preset children). */
    exerciseId: z.string().uuid().optional(),
    // RN's fetch (whatwg-fetch) appends `_=<timestamp>` to GET URLs when a
    // caller passes `cache: 'no-store'`, so the strict schema must tolerate it.
    _: z.string().optional(),
  })
  .strict();

/** Query params for the per-exercise best/last/recent-sessions stats endpoint */
export const exerciseStatsQuerySchema = z.object({
  /**
   * Preset-entry UUID to exclude from the baseline (today's in-progress/
   * planned sets, or the workout being edited). Applies to bestSet, lastSet,
   * and recentSessions.
   */
  excludePresetEntryId: z.string().uuid().optional(),
  /**
   * Workout preset id to scope recentSessions to, so the live "Previous"
   * placeholders reflect this preset's own history instead of this
   * exercise's history from a different preset. Does not affect
   * bestSet/lastSet, which stay exercise-global.
   */
  presetId: z.coerce.number().int().positive().optional(),
});

// --- Building blocks ---

/**
 * Minimal exercise metadata needed to label a history entry.
 * Clients that need full exercise-library details should fetch the exercise itself.
 */
export const exerciseSnapshotResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string().nullable(),
    modality: exerciseModalitySchema.nullable().optional(),
    images: z.array(z.string()).nullable(),
    primary_muscles: z.array(z.string()).nullable(),
    secondary_muscles: z.array(z.string()).nullable(),
    equipment: z.array(z.string()).nullable(),
    instructions: z.array(z.string()).nullable(),
    force: z.string().nullable(),
    level: z.string().nullable(),
    mechanic: z.string().nullable(),
    source: z.string().nullable().optional(),
    source_id: z.string().nullable().optional(),
    is_custom: z.boolean().nullable().optional(),
    user_id: z.string().nullable().optional(),
    calories_per_hour: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    shared_with_public: z.boolean().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    duration_min: z.number().nullable().optional(),
  })
  .strict();

/**
 * The snapshot as it appears on a diary entry, where the library row may be
 * gone. Same fields as the base snapshot, but `id` can be null: the base schema
 * keeps a required id because it is also used for live library and search
 * results, where one always exists.
 */
export const entryExerciseSnapshotResponseSchema =
  exerciseSnapshotResponseSchema.extend({ id: z.string().nullable() });

/** A single set within an exercise entry */
export const exerciseEntrySetResponseSchema = z.object({
  id: z.number(),
  set_number: z.number(),
  set_type: z.string().nullable(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  // Per-set duration is integer SECONDS.
  duration: z.number().int().nullable(),
  rest_time: z.number().nullable(),
  notes: z.string().nullable(),
  rpe: z.number().nullable(),
  completed_at: z.string().nullable(),
  is_pr: z.boolean(),
  rir: z.number().nullable().optional(),
  // Km. Optional: pre-distance servers omit it.
  distance: z.number().nullable().optional(),
  // Progression & Equipment Fields
  progression_mode: z
    .enum(['rep_goal', 'fixed', 'step_load', 'manual'])
    .nullable()
    .optional(),
  rep_goal: z.number().int().nullable().optional(),
  increment_type: z.enum(['weight', 'reps']).nullable().optional(),
  increment_value: z.number().nullable().optional(),
  equipment_brand: z.string().nullable().optional(),
});

/** Flexible activity detail blob (heart rate zones, splits, etc.) */
export const activityDetailResponseSchema = z.object({
  id: z.string(),
  provider_name: z.string(),
  detail_type: z.string(),
  detail_data: z.unknown(),
});

// --- Request contracts for grouped workout sessions ---

/** exercise_preset_entries.location is varchar(255). */
export const WORKOUT_LOCATION_MAX_LENGTH = 255;

// Free-text gym name. Blank input clears the location rather than storing ''.
const workoutLocationRequestSchema = z
  .string()
  .trim()
  .max(WORKOUT_LOCATION_MAX_LENGTH)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

/** Reps in reserve: 0 = failure. exercise_entry_sets.rir is numeric(3,1). */
export const RIR_MIN = 0;
export const RIR_MAX = 10;

export const exerciseEntrySetRequestSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullable().optional(),
    set_number: z.number().int().positive(),
    set_type: z.string().nullable().optional(),
    reps: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    // Per-set duration is integer SECONDS.
    duration: z.number().int().nullable().optional(),
    rest_time: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    rpe: z.number().nullable().optional(),
    rir: z.number().min(RIR_MIN).max(RIR_MAX).nullable().optional(),
    completed_at: z.iso.datetime().nullable().optional(),
    is_pr: z.boolean().optional(),
    // Km; only meaningful on duration_distance sets.
    distance: z.number().nullable().optional(),
  })
  .strict();

export const presetSessionExerciseRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    // Null when the library exercise this entry was logged from has since been
    // deleted (20260912150000_preserve_data_on_user_and_library_deletes.sql).
    // The entry stands on its own snapshot, so re-saving the workout it belongs
    // to has to be able to send it back. Creating a *new* entry still requires a
    // real exercise -- see createExerciseEntryRequestSchema.
    exercise_id: z.string().uuid().nullable(),
    sort_order: z.number().int().min(0).default(0),
    duration_minutes: z.number().min(0).default(0),
    // Manual per-exercise override; when omitted the server recomputes
    // calories from duration and sets.
    calories_burned: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
    superset_group: z.number().int().nullable().optional(),
    // Progression & Equipment Fields
    progression_mode: z
      .enum(['rep_goal', 'fixed', 'step_load', 'manual'])
      .nullable()
      .optional(),
    rep_goal: z.number().int().positive().nullable().optional(),
    increment_type: z.enum(['weight', 'reps']).nullable().optional(),
    increment_value: z.number().positive().nullable().optional(),
    equipment_brand: z.string().nullable().optional(),
    sets: z.array(exerciseEntrySetRequestSchema).default([]),
    entry_time: timeStringSchema.nullish(),
    workout_plan_assignment_id: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
  })
  .strict();

export const activityDetailRequestItemSchema = z.object({
  id: z.string().optional(),
  provider_name: z.string().optional(),
  detail_type: z.string().optional(),
  detail_data: z.unknown().optional(),
});

export const wodScoreDetailDataSchema = z.object({
  workout_format: workoutFormatSchema,
  time_cap_seconds: z.number().int().nullable().optional(),
  score_type: z.enum(['time', 'rounds_reps', 'total_reps', 'completion']),
  rounds_completed: z.number().int().nullable().optional(),
  reps_completed: z.number().int().nullable().optional(),
  elapsed_seconds: z.number().int().nullable().optional(),
  status: z.enum(['rx', 'scaled']).nullable().optional(),
  scaling_notes: z.string().nullable().optional(),
  rounds: z
    .array(
      z.object({
        round: z.number().int(),
        started_at_s: z.number().optional(),
        completed_at_s: z.number().optional(),
      })
    )
    .optional(),
});

// A workout session can be started in two ways:
// 1. From a stored preset blueprint (workout_preset_id provided; exercises optional)
// 2. As a freeform workout (no workout_preset_id; non-empty name and at least one exercise required)
// Both sources can also be provided together (e.g. client starts from a preset with client-supplied sets).
export const createPresetSessionRequestSchema = z
  .object({
    workout_preset_id: z.number().int().nullable().optional(),
    entry_date: dateStringSchema,
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    location: workoutLocationRequestSchema,
    source: z.string().default('manual'),
    exercises: z.array(presetSessionExerciseRequestSchema).optional(),
    workoutPlanAssignmentId: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
    activity_details: z.array(activityDetailRequestItemSchema).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasPresetId =
      data.workout_preset_id !== undefined && data.workout_preset_id !== null;
    const hasExercises = data.exercises !== undefined;

    // Freeform workouts require a non-empty name
    if (!hasPresetId) {
      if (!data.name || data.name.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Name is required when creating a freeform workout',
          path: ['name'],
        });
      }
    }

    if (hasPresetId && !hasExercises) {
      return;
    }

    if (!hasExercises || !data.exercises || data.exercises.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Workout session must include at least one exercise when not started from a stored preset.',
        path: ['exercises'],
      });
    }
  });
export const updatePresetSessionRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    location: workoutLocationRequestSchema,
    entry_date: dateStringSchema.optional(),
    exercises: z.array(presetSessionExerciseRequestSchema).min(1).optional(),
    activity_details: z.array(activityDetailRequestItemSchema).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasAnyField =
      data.name !== undefined ||
      data.description !== undefined ||
      data.notes !== undefined ||
      data.location !== undefined ||
      data.entry_date !== undefined ||
      data.exercises !== undefined ||
      data.activity_details !== undefined;

    if (!hasAnyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided.',
      });
    }
  });

// One heart-rate sample captured on a paired watch during a live workout.
export const heartRateSampleRequestSchema = z.object({
  /** ISO 8601 instant. */
  t: z.iso.datetime(),
  bpm: z.number().positive(),
});

// Attaches what a paired Apple Watch measured during a live workout to an
// exercise entry that already exists (created by the live-workout
// start/reconcile flow before any of this was known) rather than creating
// one, unlike the HealthKit/Health Connect/Garmin sync path.
//
// Both fields are optional but at least one must be present: heart rate and
// active energy come from the same HKLiveWorkoutBuilder, but the wearer can
// grant one HealthKit permission and refuse the other, so either can be the
// only thing a workout produced.
export const attachExerciseEntryWatchTelemetryRequestSchema = z
  .object({
    // Two samples minimum: the zone calculator derives each zone's duration
    // from the gaps between consecutive readings, so a lone sample spans no
    // time and contributes nothing. Capped well above a long workout (the
    // watch expands a series at 30s) so one post cannot exhaust the parser
    // or the zone sort.
    hrSamples: z
      .array(heartRateSampleRequestSchema)
      .min(2)
      .max(10000)
      .optional(),
    /**
     * Active energy the watch actually measured for this exercise, in kcal.
     * Replaces the server's duration-and-sets estimate for this entry, which
     * is a formula rather than a measurement.
     */
    activeEnergyKcal: z.number().nonnegative().optional(),
    /**
     * Minutes the watch spent showing this exercise, including rest between
     * its sets. The plan's set timers are often zero, so zone seconds had
     * nothing on the entry to line up with.
     */
    durationMinutes: z.number().nonnegative().optional(),
    /**
     * Apple's time-in-zone for the whole workout, from the finished
     * HKWorkout. When these five zones are usable they are stored as the
     * device's zones and the series is not bucketed again. One post per
     * workout: the server clears zones on the other exercises of the same
     * session so the chart is not counted twice.
     */
    appleZones: z
      .array(
        z.object({
          index: z.number().int().min(0).max(20).optional(),
          minimumBpm: z.number().min(0).max(300).nullable().optional(),
          maximumBpm: z.number().min(0).max(300).nullable().optional(),
          seconds: z
            .number()
            .nonnegative()
            .max(7 * 24 * 60 * 60),
        })
      )
      .max(8)
      .optional(),
    /**
     * Stride length of the entry, in cm; null clears it. Telemetry only: it
     * leaves the duration and everything else on the entry alone.
     */
    strideLengthCm: z.number().positive().max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.hrSamples !== undefined ||
      body.activeEnergyKcal !== undefined ||
      body.strideLengthCm !== undefined ||
      (body.durationMinutes !== undefined && body.durationMinutes > 0) ||
      (body.appleZones !== undefined && body.appleZones.length > 0),
    {
      message:
        'At least one of hrSamples, activeEnergyKcal, durationMinutes, strideLengthCm, or appleZones is required.',
    }
  );

export const createExerciseEntryRequestSchema = z
  .object({
    exercise_id: z.string().uuid(),
    // Display name for this entry. Indoor recordings log "Indoor Walking"
    // against the Walking exercise. Omitted names still snapshot the library
    // exercise.
    exercise_name: z.string().optional(),
    duration_minutes: z.coerce.number().min(0).default(0),
    calories_burned: z.coerce.number().min(0).default(0),
    entry_date: dateStringSchema,
    entry_time: timeStringSchema.nullish(),
    notes: z.string().nullable().optional(),
    sets: z.array(exerciseEntrySetRequestSchema).optional(),
    reps: z.coerce.number().nullable().optional(),
    weight: z.coerce.number().nullable().optional(),
    workout_plan_assignment_id: z.string().uuid().nullable().optional(),
    image_url: z.string().nullable().optional(),
    distance: z.coerce.number().nullable().optional(),
    avg_heart_rate: z.coerce.number().nullable().optional(),
    max_heart_rate: z.coerce.number().nullable().optional(),
    heart_rate_recovery_1min: z.coerce.number().nullable().optional(),
    avg_respiration_brpm: z.coerce.number().nullable().optional(),
    max_respiration_brpm: z.coerce.number().nullable().optional(),
    avg_speed_mps: z.coerce.number().nullable().optional(),
    max_speed_mps: z.coerce.number().nullable().optional(),
    avg_cadence: z.coerce.number().nullable().optional(),
    max_cadence: z.coerce.number().nullable().optional(),
    avg_power_watts: z.coerce.number().nullable().optional(),
    max_power_watts: z.coerce.number().nullable().optional(),
    normalized_power_watts: z.coerce.number().nullable().optional(),
    tss_score: z.coerce.number().nullable().optional(),
    intensity_factor: z.coerce.number().nullable().optional(),
    elevation_gain_meters: z.coerce.number().nullable().optional(),
    elevation_loss_meters: z.coerce.number().nullable().optional(),
    floors_climbed: z.coerce.number().nullable().optional(),
    stroke_count: z.coerce.number().nullable().optional(),
    training_load: z.coerce.number().nullable().optional(),
    aerobic_training_effect: z.coerce.number().nullable().optional(),
    anaerobic_training_effect: z.coerce.number().nullable().optional(),
    vo2_max_estimate: z.coerce.number().nullable().optional(),
    avg_temperature_celsius: z.coerce.number().nullable().optional(),
    max_temperature_celsius: z.coerce.number().nullable().optional(),
    weather_condition: z.string().nullable().optional(),
    weather_temp_celsius: z.coerce.number().nullable().optional(),
    weather_wind_speed_mps: z.coerce.number().nullable().optional(),
    weather_humidity_percentage: z.coerce.number().nullable().optional(),
    gear_name: z.string().nullable().optional(),
    gear_external_id: z.string().nullable().optional(),
    workout_effort: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .nullable()
      .optional(),
    calories_applied: z.coerce.number().min(0).nullable().optional(),
    steps: z.coerce.number().nullable().optional(),
    water_estimated: z.coerce.number().nullable().optional(),
    moving_time_seconds: z.coerce.number().nullable().optional(),
    elapsed_time_seconds: z.coerce.number().nullable().optional(),
    work_time_seconds: z.coerce.number().nullable().optional(),
    resting_calories: z.coerce.number().nullable().optional(),
    active_calories: z.coerce.number().nullable().optional(),
    avg_moving_speed_mps: z.coerce.number().nullable().optional(),
    min_elevation_meters: z.coerce.number().nullable().optional(),
    max_elevation_meters: z.coerce.number().nullable().optional(),
    ground_contact_time_ms: z.coerce.number().nullable().optional(),
    vertical_oscillation_mm: z.coerce.number().nullable().optional(),
    stride_length_cm: z.coerce.number().nullable().optional(),
    activity_details: z.array(activityDetailRequestItemSchema).optional(),
  })
  .strict();

export const updateExerciseEntryRequestSchema = createExerciseEntryRequestSchema
  .partial()
  .strict();

// --- Exercise entry (shared shape used in both individual and preset contexts) ---

export const exerciseEntryResponseSchema = z.object({
  id: z.string(),
  // Nulled rather than cascaded when the library exercise is deleted
  // (20260912150000_preserve_data_on_user_and_library_deletes.sql), so the
  // entry outlives it. Parsing a preserved entry would throw otherwise.
  exercise_id: z.string().nullable(),
  duration_minutes: z.number(),
  calories_burned: z.number(),
  entry_date: z.string().nullable(),
  entry_time: z.string().nullish(),
  /** IANA zone `entry_time` was recorded in; null for older and manual entries. */
  record_timezone: z.string().nullish(),
  notes: z.string().nullable(),
  distance: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  source: z.string().nullable(),
  image_url: z.string().nullable().optional(),
  exercise_preset_entry_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  sets: z.array(exerciseEntrySetResponseSchema),
  // Entry snapshots outlive the library row they were copied from, so their
  // id can be null. The base schema keeps a required id because it is also
  // used for live library and search results, where one always exists.
  exercise_snapshot: entryExerciseSnapshotResponseSchema.nullable(),
  activity_details: z.array(activityDetailResponseSchema),
  steps: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  superset_group: z.number().int().nullable(),
  workout_plan_assignment_id: z
    .union([z.string(), z.number()])
    .nullable()
    .optional(),
  max_heart_rate: z.number().nullable().optional(),
  heart_rate_recovery_1min: z.number().nullable().optional(),
  avg_respiration_brpm: z.number().nullable().optional(),
  max_respiration_brpm: z.number().nullable().optional(),
  avg_speed_mps: z.number().nullable().optional(),
  max_speed_mps: z.number().nullable().optional(),
  avg_cadence: z.number().nullable().optional(),
  max_cadence: z.number().nullable().optional(),
  avg_power_watts: z.number().nullable().optional(),
  max_power_watts: z.number().nullable().optional(),
  normalized_power_watts: z.number().nullable().optional(),
  tss_score: z.number().nullable().optional(),
  intensity_factor: z.number().nullable().optional(),
  elevation_gain_meters: z.number().nullable().optional(),
  elevation_loss_meters: z.number().nullable().optional(),
  floors_climbed: z.number().nullable().optional(),
  stroke_count: z.number().nullable().optional(),
  training_load: z.number().nullable().optional(),
  aerobic_training_effect: z.number().nullable().optional(),
  anaerobic_training_effect: z.number().nullable().optional(),
  vo2_max_estimate: z.number().nullable().optional(),
  avg_temperature_celsius: z.number().nullable().optional(),
  max_temperature_celsius: z.number().nullable().optional(),
  weather_condition: z.string().nullable().optional(),
  weather_temp_celsius: z.number().nullable().optional(),
  weather_wind_speed_mps: z.number().nullable().optional(),
  weather_humidity_percentage: z.number().nullable().optional(),
  gear_name: z.string().nullable().optional(),
  gear_external_id: z.string().nullable().optional(),
  workout_effort: z.number().int().min(1).max(10).nullable().optional(),
  shoe_id: z.string().nullable().optional(),
  /** Calories the daily balance counts instead of `calories_burned`; null counts the estimate. */
  calories_applied: z.number().nullable().optional(),
  /** Shared by the two sides of a calorie link; null when not linked. */
  calorie_link_id: z.string().nullable().optional(),
  calorie_link_resolution: calorieLinkResolutionSchema.nullable().optional(),
  water_estimated: z.number().nullable().optional(),
  moving_time_seconds: z.number().nullable().optional(),
  elapsed_time_seconds: z.number().nullable().optional(),
  work_time_seconds: z.number().nullable().optional(),
  resting_calories: z.number().nullable().optional(),
  active_calories: z.number().nullable().optional(),
  avg_moving_speed_mps: z.number().nullable().optional(),
  min_elevation_meters: z.number().nullable().optional(),
  max_elevation_meters: z.number().nullable().optional(),
  ground_contact_time_ms: z.number().nullable().optional(),
  vertical_oscillation_mm: z.number().nullable().optional(),
  stride_length_cm: z.number().nullable().optional(),
});

/** Set shape in progress responses: mirrors request fields but strips undeclared server fields rather than throwing */
export const exerciseProgressSetSchema = exerciseEntrySetRequestSchema.strip();

export const exerciseProgressResponseSchema = z.object({
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  duration_minutes: z.number().min(0).default(0),
  calories_burned: z.number().min(0).default(0),
  notes: z.string().nullable(),
  image_url: z.string().nullable(),
  distance: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  provider_name: z.string().nullable(),
  exercise_preset_entry_id: z.string().nullable().optional(),
  exercise_preset_entry_name: z.string().nullable().optional(),
  has_telemetry: z.boolean().nullable().optional(),
  category: z.string().nullable().optional(),
  /** The entry's modality; `bodyweight_reps` sets add body weight to load. */
  modality: exerciseModalitySchema.nullable().optional(),
  /** The lifter's body weight that day (kg), null with no check-ins. */
  body_weight_kg: z.number().nullable().optional(),
  sets: z.array(exerciseProgressSetSchema),
});

// --- Session types (discriminated by "type") ---

/** Standalone exercise entry (cardio, single exercise, etc.) */
export const individualSessionResponseSchema =
  exerciseEntryResponseSchema.extend({
    type: z.literal('individual'),
    name: z.string().nullable(),
  });

/** Grouped workout session with nested exercise entries */
export const presetSessionResponseSchema = z.object({
  type: z.literal('preset'),
  id: z.string(),
  entry_date: z.string().nullable(),
  workout_preset_id: z.number().int().nullable(),
  workout_plan_assignment_id: z
    .union([z.string(), z.number()])
    .nullable()
    .optional(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  location: z.string().nullable().optional(),
  source: z.string(),
  created_at: z.string().nullable().optional(),
  total_duration_minutes: z.number(),
  exercises: z.array(exerciseEntryResponseSchema),
  exercise_snapshot: exerciseSnapshotResponseSchema.nullable().optional(),
  activity_details: z.array(activityDetailResponseSchema),
});

/** Any session returned by the exercise entries endpoints */
export const exerciseSessionResponseSchema = z.discriminatedUnion('type', [
  individualSessionResponseSchema,
  presetSessionResponseSchema,
]);

// --- History endpoint ---

export const exerciseHistoryResponseSchema = z
  .object({
    sessions: z.array(exerciseSessionResponseSchema),
    pagination: paginationSchema,
  })
  .strict();

// --- FIT file import endpoint ---

/** Outcome for a single uploaded FIT file within an import batch */
export const importFitFileResultSchema = z
  .object({
    fileName: z.string(),
    status: z.enum(['created', 'updated', 'failed']),
    reason: z.string().optional(),
    warning: z.string().optional(),
    exerciseEntryId: z.string().optional(),
    entryDate: dateStringSchema.optional(),
    activityName: z.string().optional(),
    sport: z.string().optional(),
  })
  .strict();

/**
 * FIT import responses are always 200 with mixed per-file results; per-file
 * failures are ordinary rows, not HTTP errors.
 */
export const importFitResponseSchema = z
  .object({
    message: z.string(),
    created: z.number().int().min(0),
    updated: z.number().int().min(0),
    failed: z.number().int().min(0),
    results: z.array(importFitFileResultSchema),
  })
  .strict();

// --- Per-exercise stats endpoint ---

export const exerciseSetStatsSchema = z
  .object({
    entryDate: dateStringSchema,
    weight: z.number().nullable(),
    reps: z.number().int().nullable(),
    setNumber: z.number().int(),
  })
  .strict();

export const exerciseRecentSessionSetSchema = z
  .object({
    setNumber: z.number().int(),
    setType: z.string().nullable(),
    weight: z.number().nullable(),
    reps: z.number().int().nullable(),
    // Integer SECONDS. Optional: pre-modality servers omit it.
    duration: z.number().int().nullable().optional(),
    // Km. Optional: pre-distance servers omit it.
    distance: z.number().nullable().optional(),
  })
  .strict()
  .refine(
    (s) =>
      s.weight != null ||
      s.reps != null ||
      s.duration != null ||
      s.distance != null,
    {
      message:
        'Recent-session sets must have weight, reps, duration, or distance',
    }
  );

export const exerciseRecentSessionSchema = z
  .object({
    entryDate: dateStringSchema,
    sets: z.array(exerciseRecentSessionSetSchema).min(1),
  })
  .strict();

export const exerciseStatsResponseSchema = z
  .object({
    bestSet: exerciseSetStatsSchema.nullable(),
    lastSet: exerciseSetStatsSchema.nullable(),
    recentSessions: z.array(exerciseRecentSessionSchema).max(3),
  })
  .strict();

// --- Types ---

export type ExerciseHistoryQuery = z.infer<typeof exerciseHistoryQuerySchema>;
export type ExerciseStatsQuery = z.infer<typeof exerciseStatsQuerySchema>;
export type ExerciseSnapshotResponse = z.infer<
  typeof exerciseSnapshotResponseSchema
>;
export type EntryExerciseSnapshotResponse = z.infer<
  typeof entryExerciseSnapshotResponseSchema
>;
// A GPS track recorded on the phone, attached to an entry created beforehand
// through the ordinary create endpoint. Splits are sent as bare time windows;
// the server derives per-lap distance, pace and elevation from the points, the
// same way it does for tracks that arrive through health sync.
export const attachExerciseEntryGpsTrackRequestSchema = z
  .object({
    // Two points minimum: a single fix draws no route and measures no distance.
    // Capped well above a long recording (about 14 hours at one point per
    // second) so one post cannot exhaust the parser.
    points: z
      .array(
        gpsTrackPointSchema.extend({
          // Reject a bad instant here. The service used to drop it and still
          // save the rest, which stored a shorter route than the client sent.
          t: z.iso.datetime(),
        })
      )
      .min(2)
      .max(50000),
    laps: z
      .array(
        z.object({
          lap_index: z.number().int().positive(),
          start_time: z.iso.datetime(),
          end_time: z.iso.datetime(),
        })
      )
      .max(1000)
      .optional(),
  })
  .strict();

// Laps for an entry that has no GPS track, such as a treadmill run recorded on
// the watch: the windows the wearer marked, with the distance the watch
// estimated for each. With a track the server derives all of this from the
// points instead (see the gps-track request above).
export const attachExerciseEntryLapsRequestSchema = z
  .object({
    laps: z
      .array(
        z.object({
          lap_index: z.number().int().positive().max(1000),
          // ISO instants with an offset, so a lap never shifts with the
          // server's own timezone.
          start_time: z.string().datetime({ offset: true }),
          end_time: z.string().datetime({ offset: true }),
          distance_meters: z.number().nonnegative().max(1_000_000).optional(),
          avg_heart_rate: z.number().positive().max(300).optional(),
        })
      )
      .min(1)
      .max(1000)
      .refine(
        (laps) =>
          new Set(laps.map((lap) => lap.lap_index)).size === laps.length,
        { message: 'Each lap needs its own lap_index.' }
      )
      .refine(
        (laps) =>
          laps.every(
            (lap) => Date.parse(lap.end_time) > Date.parse(lap.start_time)
          ),
        { message: 'Every lap must end after it starts.' }
      ),
  })
  .strict();

export type ExerciseEntrySetRequest = z.infer<
  typeof exerciseEntrySetRequestSchema
>;
// Corrects the distance of an entry that has no GPS track (a treadmill run
// where the belt's display is more accurate than the watch's estimate).
export const setExerciseEntryDistanceRequestSchema = z
  .object({
    distance_km: z.number().positive().max(1000),
  })
  .strict();
export type SetExerciseEntryDistanceRequest = z.infer<
  typeof setExerciseEntryDistanceRequestSchema
>;

// How hard the person rated a finished workout, 1 (easy) to 10 (maximal).
// A strength session stores it on every exercise entry of the session.
// --- Calorie link: one session logged here and synced from a watch (#2353) ---

export const setCalorieLinkRequestSchema = z
  .object({
    synced_entry_id: z.string().uuid(),
    resolution: calorieLinkResolutionSchema,
    /** Calories the session counts in total; required for `custom`. */
    custom_calories: z.number().min(0).max(100000).optional(),
  })
  .strict()
  .refine(
    (body) => body.resolution !== 'custom' || body.custom_calories != null,
    { message: 'custom_calories is required for a custom resolution.' }
  );

/** What each entry of the linked workout now counts, so a client can update its copy. */
export const setCalorieLinkResponseSchema = z.object({
  applied: z.array(
    z.object({
      entry_id: z.string(),
      calories_applied: z.number().nullable(),
    })
  ),
});

export const calorieLinkCandidateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  source: z.string(),
  /** Local start, `HH:MM`; null when the workout has no start time. */
  start_time: z.string().nullable(),
  duration_minutes: z.number(),
  calories_burned: z.number(),
  /** Why it looks like the same session; null when the person must decide. */
  match: z.enum(['sets_within', 'overlap']).nullable(),
});

export const calorieLinkSuggestionsResponseSchema = z.object({
  /** Sum of the SparkyFitness workout's own estimates. */
  manual_total_calories: z.number(),
  link: z
    .object({
      resolution: calorieLinkResolutionSchema,
      synced_entry_id: z.string().nullable(),
    })
    .nullable(),
  candidates: z.array(calorieLinkCandidateSchema),
});

export const setExerciseEntryEffortRequestSchema = z
  .object({
    rating: z.number().int().min(1).max(10),
  })
  .strict();
export type SetCalorieLinkRequest = z.infer<typeof setCalorieLinkRequestSchema>;
export type SetCalorieLinkResponse = z.infer<
  typeof setCalorieLinkResponseSchema
>;
export type CalorieLinkCandidate = z.infer<typeof calorieLinkCandidateSchema>;
export type CalorieLinkSuggestionsResponse = z.infer<
  typeof calorieLinkSuggestionsResponseSchema
>;
export type SetExerciseEntryEffortRequest = z.infer<
  typeof setExerciseEntryEffortRequestSchema
>;

// Distance against active time for an entry with no route, for its pace chart.
// Rows are `[active seconds, cumulative metres]`, oldest first.
export const attachExerciseEntryDistanceSeriesRequestSchema = z
  .object({
    points: z
      .array(
        z.tuple([
          z.number().min(0).max(86400),
          z.number().min(0).max(1_000_000),
        ])
      )
      .min(2)
      .max(1000)
      .refine(
        (points) =>
          points.every((point, i) => {
            const previous = points[i - 1];
            return (
              previous === undefined ||
              (point[0] >= previous[0] && point[1] >= previous[1])
            );
          }),
        {
          message:
            'Active seconds and cumulative metres must not decrease from one row to the next.',
        }
      ),
  })
  .strict();
export type AttachExerciseEntryDistanceSeriesRequest = z.infer<
  typeof attachExerciseEntryDistanceSeriesRequestSchema
>;

export type AttachExerciseEntryLapsRequest = z.infer<
  typeof attachExerciseEntryLapsRequestSchema
>;
export type AttachExerciseEntryGpsTrackRequest = z.infer<
  typeof attachExerciseEntryGpsTrackRequestSchema
>;
export type HeartRateSampleRequest = z.infer<
  typeof heartRateSampleRequestSchema
>;
export type AttachExerciseEntryWatchTelemetryRequest = z.infer<
  typeof attachExerciseEntryWatchTelemetryRequestSchema
>;
export type PresetSessionExerciseRequest = z.infer<
  typeof presetSessionExerciseRequestSchema
>;
export type CreatePresetSessionRequest = z.infer<
  typeof createPresetSessionRequestSchema
>;
export type UpdatePresetSessionRequest = z.infer<
  typeof updatePresetSessionRequestSchema
>;
export type CreateExerciseEntryRequest = z.infer<
  typeof createExerciseEntryRequestSchema
>;
export type UpdateExerciseEntryRequest = z.infer<
  typeof updateExerciseEntryRequestSchema
>;
export type ExerciseEntrySetResponse = z.infer<
  typeof exerciseEntrySetResponseSchema
>;
export type ActivityDetailResponse = z.infer<
  typeof activityDetailResponseSchema
>;
export type ExerciseEntryResponse = z.infer<typeof exerciseEntryResponseSchema>;
export type IndividualSessionResponse = z.infer<
  typeof individualSessionResponseSchema
>;
export type PresetSessionResponse = z.infer<typeof presetSessionResponseSchema>;
export type ExerciseSessionResponse = z.infer<
  typeof exerciseSessionResponseSchema
>;
export type ExerciseHistoryResponse = z.infer<
  typeof exerciseHistoryResponseSchema
>;
export type ExerciseProgressResponse = z.infer<
  typeof exerciseProgressResponseSchema
>;
export type ExerciseSetStats = z.infer<typeof exerciseSetStatsSchema>;
export type ExerciseRecentSessionSet = z.infer<
  typeof exerciseRecentSessionSetSchema
>;
export type ExerciseRecentSession = z.infer<typeof exerciseRecentSessionSchema>;
export type ExerciseStatsResponse = z.infer<typeof exerciseStatsResponseSchema>;
export type ImportFitFileResult = z.infer<typeof importFitFileResultSchema>;
export type ImportFitResponse = z.infer<typeof importFitResponseSchema>;
export type WodScoreDetailData = z.infer<typeof wodScoreDetailDataSchema>;
