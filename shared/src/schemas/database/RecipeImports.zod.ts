import { z } from 'zod';
import { recipeImportSourceSchema } from '../api/RecipeImport.api.zod.ts';
export const recipeImportsSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  meal_id: z.uuid(),
  provider_id: z.uuid(),
  source: recipeImportSourceSchema,
  created_at: z.date(),
  updated_at: z.date(),
});
export type RecipeImports = z.infer<typeof recipeImportsSchema>;
