import { z } from 'zod';
export {
  recipeImportPreviewRequestSchema,
  recipeImportSaveRequestSchema,
  recipeImportSuggestionRequestSchema,
  recipeImportBrowseQuerySchema,
  recipeImportSyncRequestSchema as recipeImportSyncBodySchema,
} from '@workspace/shared';
export const recipeImportProviderParamsSchema = z.object({
  providerId: z.uuid(),
});
export const recipeImportMealParamsSchema = z.object({ mealId: z.uuid() });
