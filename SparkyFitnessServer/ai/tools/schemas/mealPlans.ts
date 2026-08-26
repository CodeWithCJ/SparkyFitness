import { z } from 'zod';
import { uuidSchema } from './common.js';

// Meal-plan templates carry nested day/meal assignment arrays that do not map
// cleanly onto a flat chatbot tool schema, so authoring (create/update) is left
// to the web UI. The AI surface exposes the safe, high-value operations: read
// the user's saved plans, inspect one in detail, duplicate a plan, and delete a
// plan.
export const MEAL_PLAN_ACTIONS = [
  'list_meal_plans',
  'get_meal_plan',
  'duplicate_meal_plan',
  'delete_meal_plan',
] as const;

const listMealPlansSchema = z
  .object({
    action: z.literal('list_meal_plans'),
  })
  .strict();

const getMealPlanSchema = z
  .object({
    action: z.literal('get_meal_plan'),
    plan_id: uuidSchema.describe('UUID of the meal plan template to inspect'),
  })
  .strict();

const duplicateMealPlanSchema = z
  .object({
    action: z.literal('duplicate_meal_plan'),
    plan_id: uuidSchema.describe('UUID of the meal plan template to duplicate'),
  })
  .strict();

const deleteMealPlanSchema = z
  .object({
    action: z.literal('delete_meal_plan'),
    plan_id: uuidSchema.describe('UUID of the meal plan template to delete'),
  })
  .strict();

export const manageMealPlansSchema = z.discriminatedUnion('action', [
  listMealPlansSchema,
  getMealPlanSchema,
  duplicateMealPlanSchema,
  deleteMealPlanSchema,
]);

export type ManageMealPlansInput = z.infer<typeof manageMealPlansSchema>;

// Flat, published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageMealPlansInput = z.object({
  action: z.enum(MEAL_PLAN_ACTIONS).optional(),
  plan_id: z.string().optional(),
});
