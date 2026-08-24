import { z } from 'zod';
import { uuidSchema } from './common.js';

// Allergen names are free-text labels the user tracks (e.g. "peanuts",
// "gluten"). The service lowercases/trims on write, so the schema only enforces
// the same length bound the REST route uses (1-100 chars).
const allergenNameSchema = z
  .string()
  .trim()
  .min(1, 'Allergen name is required')
  .max(100, 'Allergen name must be 100 characters or fewer')
  .describe('Name of the allergen (e.g. "peanuts", "gluten", "shellfish")');

const limitSchema = z.coerce
  .number()
  .int('limit must be an integer')
  .min(1, 'limit must be at least 1')
  .max(50, 'limit must be 50 or fewer');

const offsetSchema = z.coerce
  .number()
  .int('offset must be an integer')
  .min(0, 'offset must be 0 or greater');

const listAllergensSchema = z
  .object({
    action: z.literal('list_allergens'),
    limit: limitSchema
      .optional()
      .describe('Maximum number of allergens to return (1-50, default 20)'),
    offset: offsetSchema
      .optional()
      .describe('Number of allergens to skip before returning results'),
  })
  .strict();

const addAllergenSchema = z
  .object({
    action: z.literal('add_allergen'),
    allergen_name: allergenNameSchema,
  })
  .strict();

const removeAllergenSchema = z
  .object({
    action: z.literal('remove_allergen'),
    id: uuidSchema.describe('UUID of the allergen preference to remove'),
  })
  .strict();

export const manageAllergensSchema = z.discriminatedUnion('action', [
  listAllergensSchema,
  addAllergenSchema,
  removeAllergenSchema,
]);

export type ManageAllergensInput = z.infer<typeof manageAllergensSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via `manageAllergensSchema.safeParse`.
export const manageAllergensInput = z.object({
  action: z
    .enum(['list_allergens', 'add_allergen', 'remove_allergen'])
    .optional()
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  allergen_name: allergenNameSchema
    .optional()
    .describe('add_allergen: name of the allergen to track'),
  id: uuidSchema
    .optional()
    .describe('remove_allergen: UUID of the allergen preference to remove'),
  limit: limitSchema
    .optional()
    .describe('list_allergens: maximum number of allergens to return (1-50)'),
  offset: offsetSchema
    .optional()
    .describe('list_allergens: number of allergens to skip'),
});
