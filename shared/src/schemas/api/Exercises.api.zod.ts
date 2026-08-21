import { z } from "zod";
import { paginationSchema } from "./Pagination.api.zod.ts";
import { EXERCISE_MODALITIES } from "../../constants/exercise.ts";

/**
 * Wire enum for exercise modality. Optional on response schemas so
 * pre-modality servers still satisfy the client contract; clients fall back
 * to `resolveExerciseModality(modality, category)`.
 */
export const exerciseModalitySchema = z.enum(EXERCISE_MODALITIES);

// --- Query contracts ---

/** Query params for the paginated exercise library search endpoint */
export const exerciseSearchQuerySchema = z
  .object({
    searchTerm: z.string().optional(),
    equipmentFilter: z.string().optional(),
    muscleGroupFilter: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    // RN's fetch (whatwg-fetch) appends `_=<timestamp>` to GET URLs when a
    // caller passes `cache: 'no-store'`, so the strict schema must tolerate it.
    _: z.string().optional(),
  })
  .strict();

// --- Request contracts ---

/**
 * equipment/primary_muscles/secondary_muscles/instructions/images are stored
 * as a JSON array of strings (db/migrations/20250927180257_alter_exercises_table.sql).
 * free-exercise-db's raw JSON (and some legacy imports) uses a bare string
 * for a single value, so accept either shape and normalize to an array
 * rather than rejecting — rejecting would break imports over upstream
 * formatting this app doesn't control. Mirrors the read-side
 * parseJsonArrayField normalization in utils/exerciseJsonFields.ts.
 */
const exerciseStringArrayFieldSchema = z
  .union([z.array(z.string()), z.string()])
  .nullable()
  .optional()
  .transform((value) => (value == null || Array.isArray(value) ? value : [value]));

/**
 * The subset of the create/update exercise payload (`POST /exercises`,
 * `PUT /exercises/:id`) that needs shape normalization before it reaches
 * the database. `.passthrough()` so the rest of the payload (name, category,
 * modality, force, level, mechanic, description, is_public, ...) rides
 * through untouched. This schema only owns the array-shaped fields.
 *
 * The PUT handler merges this field's *existing*
 * images with new uploads (`[...(exerciseData.images ?? []), ...newPaths]`).
 * Left unnormalized, a client-sent bare string would silently spread into
 * one "image path" per character instead of one path.
 */
export const exerciseWriteArrayFieldsSchema = z
  .object({
    equipment: exerciseStringArrayFieldSchema,
    primary_muscles: exerciseStringArrayFieldSchema,
    secondary_muscles: exerciseStringArrayFieldSchema,
    instructions: exerciseStringArrayFieldSchema,
    images: exerciseStringArrayFieldSchema,
  })
  .passthrough();

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
    modality: exerciseModalitySchema.optional(),
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

/**
 * Item projected by `/exercises/search-external` (`searchExternalExercises`
 * in `services/exerciseService.ts`). wger and free-exercise-db converge on
 * this shape; the optional detail fields are always present for both, but
 * stay optional so pre-parity servers still typecheck against the contract.
 *
 * Live nutritionix items carry extra passthrough keys (`duration_min`,
 * `external_id`) that this `.strict()` schema rejects — nutritionix is exempt
 * from the contract, so don't runtime-parse its items with this schema.
 */
export const externalExerciseSearchItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    source: z.string(),
    category: z.string().nullable(),
    modality: exerciseModalitySchema.optional(),
    calories_per_hour: z.number().nullable(),
    description: z.string().optional(),
    force: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    mechanic: z.string().nullable().optional(),
    equipment: z.array(z.string()).optional(),
    primary_muscles: z.array(z.string()).optional(),
    secondary_muscles: z.array(z.string()).optional(),
    instructions: z.array(z.string()).optional(),
    images: z.array(z.string()).optional(),
  })
  .strict();

export const paginatedExternalExerciseSearchResultSchema = z
  .object({
    items: z.array(externalExerciseSearchItemSchema),
    pagination: paginationSchema,
  })
  .strict();

// --- Types ---

export type ExerciseSearchQuery = z.infer<typeof exerciseSearchQuerySchema>;
export type ExerciseWriteArrayFields = z.infer<
  typeof exerciseWriteArrayFieldsSchema
>;
export type ExerciseLibraryItem = z.infer<typeof exerciseLibraryItemSchema>;
export type PaginatedExercisesResponse = z.infer<
  typeof paginatedExercisesResponseSchema
>;
export type ExternalExerciseSearchItem = z.infer<
  typeof externalExerciseSearchItemSchema
>;
export type PaginatedExternalExerciseSearchResult = z.infer<
  typeof paginatedExternalExerciseSearchResultSchema
>;
