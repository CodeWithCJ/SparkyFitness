import { z } from 'zod';
import { uuidSchema } from './common.js';

// Custom nutrients are user-defined nutrient definitions (name + unit + aliases)
// layered on top of the built-in nutrient catalog. They surface in food, goal,
// and report views once created.
export const CUSTOM_NUTRIENT_ACTIONS = [
  'list_custom_nutrients',
  'get_custom_nutrient',
  'create_custom_nutrient',
  'update_custom_nutrient',
  'delete_custom_nutrient',
] as const;

const nutrientNameSchema = z
  .string()
  .trim()
  .min(1, 'Nutrient name is required')
  .max(100, 'Nutrient name must be 100 characters or fewer');

const nutrientUnitSchema = z
  .string()
  .trim()
  .min(1, 'Unit is required')
  .max(20, 'Unit must be 20 characters or fewer');

const aliasesSchema = z
  .array(z.string().trim().min(1))
  .describe('Alternate spellings that map onto this nutrient');

const listCustomNutrientsSchema = z
  .object({
    action: z.literal('list_custom_nutrients'),
  })
  .strict();

const getCustomNutrientSchema = z
  .object({
    action: z.literal('get_custom_nutrient'),
    id: uuidSchema.describe('UUID of the custom nutrient'),
  })
  .strict();

const createCustomNutrientSchema = z
  .object({
    action: z.literal('create_custom_nutrient'),
    name: nutrientNameSchema,
    unit: nutrientUnitSchema,
    aliases: aliasesSchema.optional(),
    default_target: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .describe('Optional daily target seeded onto goals (defaults to 0)'),
  })
  .strict();

const updateCustomNutrientSchema = z
  .object({
    action: z.literal('update_custom_nutrient'),
    id: uuidSchema.describe('UUID of the custom nutrient to update'),
    name: nutrientNameSchema.optional(),
    unit: nutrientUnitSchema.optional(),
    aliases: aliasesSchema.optional(),
  })
  .strict();

const deleteCustomNutrientSchema = z
  .object({
    action: z.literal('delete_custom_nutrient'),
    id: uuidSchema.describe('UUID of the custom nutrient to delete'),
    delete_all_history: z
      .boolean()
      .optional()
      .describe(
        'When true, also purge the nutrient from past diary entries and goals'
      ),
  })
  .strict();

export const manageCustomNutrientsSchema = z.discriminatedUnion('action', [
  listCustomNutrientsSchema,
  getCustomNutrientSchema,
  createCustomNutrientSchema,
  updateCustomNutrientSchema,
  deleteCustomNutrientSchema,
]);

export type ManageCustomNutrientsInput = z.infer<
  typeof manageCustomNutrientsSchema
>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via safeParse.
export const manageCustomNutrientsInput = z.object({
  action: z
    .enum(CUSTOM_NUTRIENT_ACTIONS)
    .optional()
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  id: uuidSchema
    .optional()
    .describe('get/update/delete: UUID of the custom nutrient'),
  name: nutrientNameSchema
    .optional()
    .describe('create/update: nutrient display name'),
  unit: nutrientUnitSchema
    .optional()
    .describe('create/update: measurement unit (e.g. mg, mcg, IU)'),
  aliases: aliasesSchema.optional().describe('create/update: alternate names'),
  default_target: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .describe('create: optional daily target'),
  delete_all_history: z
    .boolean()
    .optional()
    .describe('delete: also purge historical diary/goal data'),
});
