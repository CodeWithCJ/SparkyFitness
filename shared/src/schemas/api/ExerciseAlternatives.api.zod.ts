import { z } from 'zod';
import { exerciseModalitySchema } from './Exercises.api.zod.ts';

/**
 * `GET /v2/exercises/:exerciseId/alternatives` — ranked substitutes for an
 * exercise (issue #1560). Ranking lives on the server so web, mobile and the
 * AI assistant all agree on what "a good alternative" is.
 */

export const EXERCISE_ALTERNATIVE_MODES = [
  'similar',
  'different_equipment',
] as const;
export const exerciseAlternativeModeSchema = z.enum(EXERCISE_ALTERNATIVE_MODES);
export type ExerciseAlternativeMode = z.infer<
  typeof exerciseAlternativeModeSchema
>;

const commaList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );

export const exerciseAlternativesQuerySchema = z
  .object({
    /**
     * `similar` prefers the same equipment; `different_equipment` only
     * returns exercises that use none of the source's equipment (busy
     * machine, no barbell at home, a grip that aggravates an injury).
     */
    mode: exerciseAlternativeModeSchema.default('similar'),
    /** Only suggest exercises that need nothing beyond this equipment. */
    equipment: commaList,
    /** Never suggest exercises that work any of these muscles (injury). */
    excludeMuscles: commaList,
    /** Library ids / catalog ids to leave out (e.g. already in the workout). */
    excludeIds: commaList,
    /** Include not-yet-imported Free Exercise DB exercises. */
    includeCatalog: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value !== 'false'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    // RN's fetch appends `_=<timestamp>` for `cache: 'no-store'`.
    _: z.string().optional(),
  })
  .strict();
export type ExerciseAlternativesQuery = z.input<
  typeof exerciseAlternativesQuerySchema
>;

/** Why an alternative was suggested; clients render each as a short label. */
export const EXERCISE_ALTERNATIVE_REASONS = [
  'same_primary_muscles',
  'shares_primary_muscle',
  'same_equipment',
  'different_equipment',
  'same_movement',
  'recently_performed',
  'in_library',
] as const;
export const exerciseAlternativeReasonSchema = z.enum(
  EXERCISE_ALTERNATIVE_REASONS
);
export type ExerciseAlternativeReason = z.infer<
  typeof exerciseAlternativeReasonSchema
>;

export const exerciseAlternativeSchema = z
  .object({
    /**
     * `library` — an exercise the user can already log (`id` is its uuid).
     * `catalog` — a Free Exercise DB exercise not in the library yet (`id`
     * is its catalog id); import it with `POST /freeexercisedb/add` first.
     */
    origin: z.enum(['library', 'catalog']),
    id: z.string(),
    name: z.string(),
    source: z.string().nullable(),
    category: z.string().nullable(),
    modality: exerciseModalitySchema,
    level: z.string().nullable(),
    mechanic: z.string().nullable(),
    force: z.string().nullable(),
    equipment: z.array(z.string()),
    primary_muscles: z.array(z.string()),
    secondary_muscles: z.array(z.string()),
    /** Library rows keep their stored (relative) paths; catalog rows are absolute URLs. */
    images: z.array(z.string()),
    instructions: z.array(z.string()),
    description: z.string().nullable(),
    /** Null for catalog rows; the import assigns one. */
    calories_per_hour: z.number().nullable(),
    score: z.number(),
    reasons: z.array(exerciseAlternativeReasonSchema),
    /** Most recent day (YYYY-MM-DD) the user logged it, if ever. */
    last_performed_date: z.string().nullable(),
  })
  .strict();
export type ExerciseAlternative = z.infer<typeof exerciseAlternativeSchema>;

export const exerciseAlternativesResponseSchema = z
  .object({
    source: z
      .object({
        id: z.string(),
        name: z.string(),
        primary_muscles: z.array(z.string()),
        equipment: z.array(z.string()),
      })
      .strict(),
    alternatives: z.array(exerciseAlternativeSchema),
    /**
     * False when the source has no recognisable primary muscle, so nothing
     * can be ranked; clients should fall straight back to free search.
     */
    rankable: z.boolean(),
    /** False when the catalog was requested but could not be loaded. */
    catalog_available: z.boolean(),
  })
  .strict();
export type ExerciseAlternativesResponse = z.infer<
  typeof exerciseAlternativesResponseSchema
>;
