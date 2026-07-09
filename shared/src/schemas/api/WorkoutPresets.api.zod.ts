import { z } from "zod";

// --- Response contracts ---
//
// These schemas type the CLIENT side of the wire format. The server does not
// run a response .parse() for presets: top-level preset rows carry pg `Date`
// timestamptz values (poolManager only overrides DATE), which would fail the
// string timestamp fields below.

/** A single set within a workout preset exercise */
export const workoutPresetSetResponseSchema = z.object({
  id: z.number(),
  set_number: z.number(),
  set_type: z.string().nullable(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  duration: z.number().nullable(),
  rest_time: z.number().nullable(),
  notes: z.string().nullable(),
});

export const workoutPresetExerciseResponseSchema = z.object({
  id: z.number(),
  exercise_id: z.string(),
  image_url: z.string().nullable(),
  /** Only the lookup-by-name query selects sort_order; list/detail/search rely on row order. */
  sort_order: z.number().nullable().optional(),
  exercise_name: z.string(),
  category: z.string().nullable(),
  superset_group: z.number().int().nullable(),
  sets: z.array(workoutPresetSetResponseSchema),
});

export const workoutPresetResponseSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_public: z.boolean().nullable(),
  /** Absent from search results, present on list/detail responses. */
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  exercises: z.array(workoutPresetExerciseResponseSchema),
});

export const workoutPresetsListResponseSchema = z.object({
  presets: z.array(workoutPresetResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

// --- Request contracts ---
//
// Default strip mode, NOT .strict(): the web preset editor spreads full
// response objects (ids, exercise_name, category, …) into its save payloads,
// so unknown keys must be stripped rather than rejected.

export const workoutPresetSetRequestSchema = z.object({
  set_number: z.number().int().positive(),
  set_type: z.string().nullable().optional(),
  reps: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  rest_time: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const workoutPresetExerciseRequestSchema = z.object({
  /** UUID, or an external source id resolved server-side (free-exercise-db). */
  exercise_id: z.string().min(1),
  image_url: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  superset_group: z.number().int().nullable().optional(),
  sets: z.array(workoutPresetSetRequestSchema).optional(),
});

export const workoutPresetCreateRequestSchema = z.object({
  // Ownership comes from the authenticated request (req.userId), never the
  // body; strip mode drops the user_id older clients still send.
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  is_public: z.boolean().optional(),
  exercises: z.array(workoutPresetExerciseRequestSchema).default([]),
});

/** Update is a diff: name/description/exercises may each be omitted. */
export const workoutPresetUpdateRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_public: z.boolean().optional(),
  exercises: z.array(workoutPresetExerciseRequestSchema).optional(),
});

// --- Types ---

export type WorkoutPresetSetResponse = z.infer<
  typeof workoutPresetSetResponseSchema
>;
export type WorkoutPresetExerciseResponse = z.infer<
  typeof workoutPresetExerciseResponseSchema
>;
export type WorkoutPresetResponse = z.infer<typeof workoutPresetResponseSchema>;
export type WorkoutPresetsListResponse = z.infer<
  typeof workoutPresetsListResponseSchema
>;
export type WorkoutPresetSetRequest = z.infer<
  typeof workoutPresetSetRequestSchema
>;
export type WorkoutPresetExerciseRequest = z.infer<
  typeof workoutPresetExerciseRequestSchema
>;
export type WorkoutPresetCreateRequest = z.infer<
  typeof workoutPresetCreateRequestSchema
>;
export type WorkoutPresetUpdateRequest = z.infer<
  typeof workoutPresetUpdateRequestSchema
>;
