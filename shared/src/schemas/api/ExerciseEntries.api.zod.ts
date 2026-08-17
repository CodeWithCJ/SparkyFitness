import { z } from "zod";
import { paginationSchema } from "./Pagination.api.zod.ts";
import { exerciseModalitySchema } from "./Exercises.api.zod.ts";

// --- Query contracts ---

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Entry date must be in YYYY-MM-DD format.");

const timeStringSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    "Entry time must be in HH:MM (24h) format.",
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

/** A single set within an exercise entry */
export const exerciseEntrySetResponseSchema = z
  .object({
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
    // Km. Optional: pre-distance servers omit it.
    distance: z.number().nullable().optional(),
  })
  .strict();

/** Flexible activity detail blob (heart rate zones, splits, etc.) */
export const activityDetailResponseSchema = z
  .object({
    id: z.string(),
    provider_name: z.string(),
    detail_type: z.string(),
    detail_data: z.unknown(),
  })
  .strict();

// --- Request contracts for grouped workout sessions ---

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
    completed_at: z.iso.datetime().nullable().optional(),
    is_pr: z.boolean().optional(),
    // Km; only meaningful on duration_distance sets.
    distance: z.number().nullable().optional(),
  })
  .strict();

export const presetSessionExerciseRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    exercise_id: z.string().uuid(),
    sort_order: z.number().int().min(0).default(0),
    duration_minutes: z.number().min(0).default(0),
    // Manual per-exercise override; when omitted the server recomputes
    // calories from duration and sets.
    calories_burned: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
    superset_group: z.number().int().nullable().optional(),
    sets: z.array(exerciseEntrySetRequestSchema).default([]),
    entry_time: timeStringSchema.nullish(),
  })
  .strict();

export const createPresetSessionRequestSchema = z
  .object({
    workout_preset_id: z.number().int().nullable().optional(),
    entry_date: dateStringSchema,
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    source: z.string().default("manual"),
    exercises: z.array(presetSessionExerciseRequestSchema).min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasPresetId =
      data.workout_preset_id !== undefined && data.workout_preset_id !== null;
    const hasExercises = data.exercises !== undefined;

    // workout_preset_id alone means "copy this preset's own stored
    // structure"; exercises alone means a freeform/individual session;
    // both together means "tag this session as started from a preset, but
    // use the client-supplied (e.g. live-workout) exercise/set structure
    // instead of the preset's stored one." Only rule out neither.
    if (!hasPresetId && !hasExercises) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a workout source: workout_preset_id or exercises.",
        path: ["exercises"],
      });
    }

    if (!hasPresetId && !data.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Name is required when creating a freeform workout.",
        path: ["name"],
      });
    }
  });

export const updatePresetSessionRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    entry_date: dateStringSchema.optional(),
    exercises: z.array(presetSessionExerciseRequestSchema).min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasAnyField =
      data.name !== undefined ||
      data.description !== undefined ||
      data.notes !== undefined ||
      data.entry_date !== undefined ||
      data.exercises !== undefined;

    if (!hasAnyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided.",
      });
    }
  });

export const activityDetailRequestItemSchema = z.object({
  id: z.string().optional(),
  provider_name: z.string().optional(),
  detail_type: z.string().optional(),
  detail_data: z.unknown().optional(),
});

export const createExerciseEntryRequestSchema = z
  .object({
    exercise_id: z.string().uuid(),
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

export const exerciseEntryResponseSchema = z
  .object({
    id: z.string(),
    exercise_id: z.string(),
    duration_minutes: z.number(),
    calories_burned: z.number(),
    entry_date: z.string().nullable(),
    entry_time: z.string().nullish(),
    notes: z.string().nullable(),
    distance: z.number().nullable(),
    avg_heart_rate: z.number().nullable(),
    source: z.string().nullable(),
    image_url: z.string().nullable().optional(),
    exercise_preset_entry_id: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    sets: z.array(exerciseEntrySetResponseSchema),
    exercise_snapshot: exerciseSnapshotResponseSchema.nullable(),
    activity_details: z.array(activityDetailResponseSchema),
    steps: z.number().nullable().optional(),
    category: z.string().nullable().optional(),
    superset_group: z.number().int().nullable(),
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
  })
  .strict();

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
  sets: z.array(exerciseEntrySetRequestSchema),
});

// --- Session types (discriminated by "type") ---

/** Standalone exercise entry (cardio, single exercise, etc.) */
export const individualSessionResponseSchema =
  exerciseEntryResponseSchema.extend({
    type: z.literal("individual"),
    name: z.string().nullable(),
  });

/** Grouped workout session with nested exercise entries */
export const presetSessionResponseSchema = z
  .object({
    type: z.literal("preset"),
    id: z.string(),
    entry_date: z.string().nullable(),
    workout_preset_id: z.number().int().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.string(),
    created_at: z.string().nullable().optional(),
    total_duration_minutes: z.number(),
    exercises: z.array(exerciseEntryResponseSchema),
    exercise_snapshot: exerciseSnapshotResponseSchema.nullable().optional(),
    activity_details: z.array(activityDetailResponseSchema),
  })
  .strict();

/** Any session returned by the exercise entries endpoints */
export const exerciseSessionResponseSchema = z.discriminatedUnion("type", [
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
    status: z.enum(["created", "updated", "failed"]),
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
        "Recent-session sets must have weight, reps, duration, or distance",
    },
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
export type ExerciseEntrySetRequest = z.infer<
  typeof exerciseEntrySetRequestSchema
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
