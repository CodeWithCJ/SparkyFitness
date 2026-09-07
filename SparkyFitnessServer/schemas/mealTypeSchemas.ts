import { z } from 'zod/v4';

/**
 * Route params for the meal-type endpoints that address a single record.
 *
 * Validating the UUID here keeps a malformed id from reaching a uuid-typed
 * query, where Postgres would raise 22P02 and the route would answer 500
 * instead of 400.
 */
export const MealTypeIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const MEAL_TYPE_DELETE_MODES = ['strict', 'reassign', 'force'] as const;

/**
 * Query for DELETE /meal-types/:id.
 *
 * `strict` is the default so an existing caller sending no query string keeps
 * its previous behaviour.
 */
export const DeleteMealTypeQuerySchema = z
  .object({
    mode: z.enum(MEAL_TYPE_DELETE_MODES).default('strict'),
    reassignTo: z.string().uuid('reassignTo must be a valid UUID').optional(),
  })
  .refine((value) => value.mode !== 'reassign' || !!value.reassignTo, {
    message: 'reassignTo is required when mode is reassign',
    path: ['reassignTo'],
  });

export type DeleteMealTypeQuery = z.infer<typeof DeleteMealTypeQuerySchema>;
