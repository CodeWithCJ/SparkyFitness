import { z } from 'zod';

// workout_plan_templates.id is a SERIAL PRIMARY KEY (integer), so plan_id must be
// a positive integer, not a UUID. z.coerce accepts the numeric string the model
// echoes back from list_workout_plans output.
const planIdSchema = z.coerce
  .number()
  .int()
  .positive('Workout plan ID must be a positive integer');

// Workout plan templates carry nested day-of-week assignment and set arrays that
// do not map cleanly onto a flat chatbot tool schema, so authoring (create/update)
// is left to the web UI. The AI surface exposes the safe, high-value operations:
// read the user's saved plans, inspect one in detail, and delete a plan.
export const WORKOUT_PLAN_ACTIONS = [
  'list_workout_plans',
  'get_workout_plan',
  'delete_workout_plan',
] as const;

const listWorkoutPlansSchema = z
  .object({
    action: z.literal('list_workout_plans'),
  })
  .strict();

const getWorkoutPlanSchema = z
  .object({
    action: z.literal('get_workout_plan'),
    plan_id: planIdSchema.describe(
      'ID of the workout plan template to inspect'
    ),
  })
  .strict();

const deleteWorkoutPlanSchema = z
  .object({
    action: z.literal('delete_workout_plan'),
    plan_id: planIdSchema.describe('ID of the workout plan template to delete'),
  })
  .strict();

export const manageWorkoutPlansSchema = z.discriminatedUnion('action', [
  listWorkoutPlansSchema,
  getWorkoutPlanSchema,
  deleteWorkoutPlanSchema,
]);

export type ManageWorkoutPlansInput = z.infer<typeof manageWorkoutPlansSchema>;

// Flat, published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageWorkoutPlansInput = z.object({
  action: z.enum(WORKOUT_PLAN_ACTIONS).optional(),
  plan_id: z.union([z.string(), z.number()]).optional(),
});
