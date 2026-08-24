import { z } from 'zod';
import { uuidSchema } from './common.js';

// Workout plan templates carry nested day-of-week assignment and set arrays that
// do not map cleanly onto a flat chatbot tool schema, so authoring (create/update)
// is left to the web UI. The AI surface exposes the safe, high-value operations:
// read the user's saved plans, inspect one in detail, and delete a plan.
export const WORKOUT_PLAN_ACTIONS = [
  'list_workout_plans',
  'get_workout_plan',
  'delete_workout_plan',
] as const;

const listWorkoutPlansSchema = z.object({
  action: z.literal('list_workout_plans'),
});

const getWorkoutPlanSchema = z.object({
  action: z.literal('get_workout_plan'),
  plan_id: uuidSchema.describe('UUID of the workout plan template to inspect'),
});

const deleteWorkoutPlanSchema = z.object({
  action: z.literal('delete_workout_plan'),
  plan_id: uuidSchema.describe('UUID of the workout plan template to delete'),
});

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
  plan_id: z.string().optional(),
});
