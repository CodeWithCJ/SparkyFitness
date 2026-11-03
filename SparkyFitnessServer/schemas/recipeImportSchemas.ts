import { z } from 'zod';
export {
  recipeImportPreviewRequestSchema,
  recipeImportSaveRequestSchema,
  recipeImportSuggestionRequestSchema,
  recipeImportBrowseQuerySchema,
} from '@workspace/shared';
export const recipeImportProviderParamsSchema = z.object({
  providerId: z.uuid(),
});
export const recipeImportMealParamsSchema = z.object({ mealId: z.uuid() });
export const recipeImportSyncBodySchema = z.object({}).strict();
