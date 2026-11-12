import { apiCall, HttpApiError } from '@/api/api';
import {
  recipeImportBrowseResponseSchema,
  recipeImportPreviewSchema,
  recipeImportSaveResponseSchema,
  recipeImportSourceSchema,
  recipeImportSuggestionResponseSchema,
  recipeImportSyncResponseSchema,
  recipeImportSyncPreviewSchema,
  recipeImportSavedMappingsResponseSchema,
  recipeImportForgetMappingResponseSchema,
  type RecipeImportPreviewRequest,
  type RecipeImportSaveRequest,
  type RecipeImportSuggestionRequest,
} from '@workspace/shared';

const root = '/v2/recipe-imports';
const quiet = { suppressErrorToast: true };
export const listRecipeMappings = async (providerId: string, page = 1) =>
  recipeImportSavedMappingsResponseSchema.parse(
    await apiCall(`${root}/mealie/${encodeURIComponent(providerId)}/mappings`, {
      ...quiet,
      params: { page },
    })
  );
export const forgetRecipeMapping = async (
  providerId: string,
  mappingId: string
) =>
  recipeImportForgetMappingResponseSchema.parse(
    await apiCall(
      `${root}/mealie/${encodeURIComponent(providerId)}/mappings/${encodeURIComponent(mappingId)}`,
      { ...quiet, method: 'DELETE' }
    )
  );

export const browseRecipes = async (
  providerId: string,
  search: string,
  page: number
) =>
  recipeImportBrowseResponseSchema.parse(
    await apiCall(`${root}/mealie/${encodeURIComponent(providerId)}/recipes`, {
      ...quiet,
      params: { search, page },
    })
  );
export const previewRecipe = async (body: RecipeImportPreviewRequest) =>
  recipeImportPreviewSchema.parse(
    await apiCall(`${root}/mealie/preview`, { ...quiet, method: 'POST', body })
  );
export const suggestRecipe = async (body: RecipeImportSuggestionRequest) =>
  recipeImportSuggestionResponseSchema.parse(
    await apiCall(`${root}/mealie/suggest`, { ...quiet, method: 'POST', body })
  );
export const saveRecipe = async (body: RecipeImportSaveRequest) =>
  recipeImportSaveResponseSchema.parse(
    await apiCall(`${root}/mealie/save`, { ...quiet, method: 'POST', body })
  );
export const getRecipeSource = async (mealId: string) => {
  try {
    const source = await apiCall<unknown>(
      `${root}/${encodeURIComponent(mealId)}/source`,
      {
        ...quiet,
        suppress404Toast: true,
      }
    );
    return source === null ? null : recipeImportSourceSchema.parse(source);
  } catch (error) {
    if (error instanceof HttpApiError && error.status === 404) return null;
    throw error;
  }
};
export const previewRecipeNutritionSync = async (mealId: string) =>
  recipeImportSyncPreviewSchema.parse(
    await apiCall(`${root}/${encodeURIComponent(mealId)}/sync-preview`, quiet)
  );
export const syncRecipeNutrition = async (
  mealId: string,
  confirmationFingerprint?: string
) =>
  recipeImportSyncResponseSchema.parse(
    await apiCall(`${root}/${encodeURIComponent(mealId)}/sync-nutrition`, {
      ...quiet,
      method: 'POST',
      body: confirmationFingerprint ? { confirmationFingerprint } : {},
    })
  );
