import { z } from 'zod';
export {
  recipeImportPreviewRequestSchema,
  recipeImportSaveRequestSchema,
  recipeImportSuggestionRequestSchema,
  recipeImportBrowseQuerySchema,
  recipeImportSavedMappingsQuerySchema,
  recipeImportSyncRequestSchema as recipeImportSyncBodySchema,
} from '@workspace/shared';
export const recipeImportProviderParamsSchema = z.object({
  providerId: z.uuid(),
});
export const recipeImportMealParamsSchema = z.object({ mealId: z.uuid() });
export const recipeImportMappingParamsSchema =
  recipeImportProviderParamsSchema.extend({ mappingId: z.uuid() });
