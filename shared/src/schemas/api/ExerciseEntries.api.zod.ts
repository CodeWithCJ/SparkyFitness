import { z } from "zod";
import { paginationSchema } from "./Pagination.api.zod";

// --- Query contracts ---

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Entry date must be in YYYY-MM-DD format.");

/** Query params for the paginated exercise history endpoint */
export const exerciseHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().uuid().optional(),
  })
  .strict();

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
    duration: z.number().nullable(),
    rest_time: z.number().nullable(),
    notes: z.string().nullable(),
    rpe: z.number().nullable(),
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
    duration: z.number().nullable().optional(),
    rest_time: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    rpe: z.number().nullable().optional(),
  })
  .strict();

export const presetSessionExerciseRequestSchema = z
  .object({
    exercise_id: z.string().uuid(),
    sort_order: z.number().int().min(0).default(0),
    duration_minutes: z.number().min(0).default(0),
    notes: z.string().nullable().optional(),
    sets: z.array(exerciseEntrySetRequestSchema).default([]),
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

    if (hasPresetId === hasExercises) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide exactly one workout source: workout_preset_id or exercises.",
        path: hasPresetId ? ["workout_preset_id"] : ["exercises"],
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

export const createExerciseEntryRequestSchema = z
  .object({
    exercise_id: z.string().uuid(),
    duration_minutes: z.coerce.number().min(0).default(0),
    calories_burned: z.coerce.number().min(0).default(0),
    entry_date: dateStringSchema,
    notes: z.string().nullable().optional(),
    sets: z.array(exerciseEntrySetRequestSchema).optional(),
    reps: z.coerce.number().nullable().optional(),
    weight: z.coerce.number().nullable().optional(),
    workout_plan_assignment_id: z.string().uuid().nullable().optional(),
    image_url: z.string().nullable().optional(),
    distance: z.coerce.number().nullable().optional(),
    avg_heart_rate: z.coerce.number().nullable().optional(),
    activity_details: z.array(z.any()).optional(), // Keep flexible for now
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
  provider_name: z.string(),
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

// --- Types ---

export type ExerciseHistoryQuery = z.infer<typeof exerciseHistoryQuerySchema>;
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
