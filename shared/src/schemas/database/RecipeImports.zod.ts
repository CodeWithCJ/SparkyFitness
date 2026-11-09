import { z } from 'zod';
import { recipeImportSourceSchema } from '../api/RecipeImport.api.zod.ts';
// Storage-only metadata; the strict public source DTO must never include it.
export const recipeImportStoredSourceSchema = recipeImportSourceSchema.extend({
  syncBaseline: z
    .object({
      version: z.literal(1),
      contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      nutritionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .optional(),
});
export type RecipeImportStoredSource = z.infer<
  typeof recipeImportStoredSourceSchema
>;
export const recipeImportsSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  meal_id: z.uuid(),
  provider_id: z.uuid(),
  source: recipeImportStoredSourceSchema,
  created_at: z.date(),
  updated_at: z.date(),
});
export type RecipeImports = z.infer<typeof recipeImportsSchema>;
