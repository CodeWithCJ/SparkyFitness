import { z } from "zod";
import { paginationSchema } from "./Pagination.api.zod.ts";

// --- Query contracts ---

/** Query params for the paginated exercise library search endpoint */
export const exerciseSearchQuerySchema = z
  .object({
    searchTerm: z.string().optional(),
    equipmentFilter: z.string().optional(),
    muscleGroupFilter: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

// --- Response contracts ---

/**
 * Library row returned by the v2 search endpoint. Mirrors exactly the columns
 * projected by `searchExercisesPaginated` in `models/exercise.ts` plus the
 * `tags: string[]` field appended by `services/exerciseService.ts`.
 */
export const exerciseLibraryItemSchema = z
  .object({
    id: z.string(),
    source: z.string().nullable(),
    source_id: z.string().nullable(),
    name: z.string(),
    force: z.string().nullable(),
    level: z.string().nullable(),
    mechanic: z.string().nullable(),
    equipment: z.array(z.string()),
    primary_muscles: z.array(z.string()),
    secondary_muscles: z.array(z.string()),
    instructions: z.array(z.string()),
    category: z.string().nullable(),
    images: z.array(z.string()),
    calories_per_hour: z.number().nullable(),
    description: z.string().nullable(),
    user_id: z.string().nullable(),
    is_custom: z.boolean().nullable(),
    shared_with_public: z.boolean().nullable(),
    tags: z.array(z.string()),
  })
  .strict();

export const paginatedExercisesResponseSchema = z
  .object({
    exercises: z.array(exerciseLibraryItemSchema),
    pagination: paginationSchema,
  })
  .strict();

// --- Types ---

export type ExerciseSearchQuery = z.infer<typeof exerciseSearchQuerySchema>;
export type ExerciseLibraryItem = z.infer<typeof exerciseLibraryItemSchema>;
export type PaginatedExercisesResponse = z.infer<
  typeof paginatedExercisesResponseSchema
>;
