import { z } from "zod";
import { paginationSchema } from "./Pagination.api.zod";

// --- Query contracts ---

/** Query params for the paginated exercise history endpoint */
export const exerciseHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
}).strict();

// --- Building blocks ---

/**
 * Minimal exercise metadata needed to label a history entry.
 * Clients that need full exercise-library details should fetch the exercise itself.
 */
export const exerciseSnapshotResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
}).strict();

/** A single set within an exercise entry */
export const exerciseEntrySetResponseSchema = z.object({
  id: z.number(),
  set_number: z.number(),
  set_type: z.string().nullable(),
  reps: z.number().nullable(),
  weight: z.number().nullable(),
  duration: z.number().nullable(),
  rest_time: z.number().nullable(),
  notes: z.string().nullable(),
  rpe: z.number().nullable(),
}).strict();

/** Flexible activity detail blob (heart rate zones, splits, etc.) */
export const activityDetailResponseSchema = z.object({
  id: z.string(),
  provider_name: z.string(),
  detail_type: z.string(),
  detail_data: z.unknown(),
}).strict();

// --- Exercise entry (shared shape used in both individual and preset contexts) ---

export const exerciseEntryResponseSchema = z.object({
  id: z.string(),
  exercise_id: z.string(),
  duration_minutes: z.number(),
  calories_burned: z.number(),
  entry_date: z.string().nullable(),
  notes: z.string().nullable(),
  distance: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  source: z.string().nullable(),
  sets: z.array(exerciseEntrySetResponseSchema),
  exercise_snapshot: exerciseSnapshotResponseSchema.nullable(),
  activity_details: z.array(activityDetailResponseSchema),
}).strict();

// --- Session types (discriminated by "type") ---

/** Standalone exercise entry (cardio, single exercise, etc.) */
export const individualSessionResponseSchema = exerciseEntryResponseSchema.extend(
  {
    type: z.literal("individual"),
  },
);

/** Grouped workout session with nested exercise entries */
export const presetSessionResponseSchema = z.object({
  type: z.literal("preset"),
  id: z.string(),
  entry_date: z.string().nullable(),
  workout_preset_id: z.number().int().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  total_duration_minutes: z.number(),
  exercises: z.array(exerciseEntryResponseSchema),
  activity_details: z.array(activityDetailResponseSchema),
}).strict();

/** Any session returned by the exercise entries endpoints */
export const exerciseSessionResponseSchema = z.discriminatedUnion("type", [
  individualSessionResponseSchema,
  presetSessionResponseSchema,
]);

// --- History endpoint ---

export const exerciseHistoryResponseSchema = z.object({
  sessions: z.array(exerciseSessionResponseSchema),
  pagination: paginationSchema,
}).strict();

// --- Types ---

export type ExerciseHistoryQuery = z.infer<typeof exerciseHistoryQuerySchema>;
export type ExerciseSnapshotResponse = z.infer<
  typeof exerciseSnapshotResponseSchema
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
