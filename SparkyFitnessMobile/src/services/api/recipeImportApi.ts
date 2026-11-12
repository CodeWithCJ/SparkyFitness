import type {
  RecipeImportBrowseResponse,
  RecipeImportPreviewRequest,
  RecipeImportPreview,
  RecipeImportSuggestionRequest,
  RecipeImportSuggestionResponse,
  RecipeImportSaveRequest,
  RecipeImportSaveResponse,
  RecipeImportSource,
  RecipeImportSyncResponse,
  RecipeImportSyncPreview,
} from '@workspace/shared';
import {
  recipeImportSavedMappingsResponseSchema,
  recipeImportForgetMappingResponseSchema,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError, getApiErrorMessage } from './errors';
import type { FoodItem } from '../../types/foods';
import type { ServerConfig } from '../storage';

const root = '/api/v2/recipe-imports';
async function request<T>(
  endpoint: string,
  body?: unknown,
  serverConfig?: ServerConfig,
  method?: 'DELETE'
): Promise<T> {
  try {
    return await apiFetch<T>({
      endpoint: root + endpoint,
      serviceName: 'Recipe Imports API',
      operation: 'access recipe import',
      ...(serverConfig ? { serverConfig } : {}),
      ...(body === undefined ? {} : { method: 'POST', body }),
      ...(method ? { method } : {}),
    });
  } catch (error) {
    const message = getApiErrorMessage(error);
    if (message && error instanceof ApiError)
      throw new ApiError(message, error.statusCode, error.body);
    throw error;
  }
}
export const listRecipeMappings = async (
  providerId: string,
  page = 1,
  serverConfig?: ServerConfig
) =>
  recipeImportSavedMappingsResponseSchema.parse(
    await request(
      `/mealie/${encodeURIComponent(providerId)}/mappings?${new URLSearchParams({ page: String(page) })}`,
      undefined,
      serverConfig
    )
  );
export const forgetRecipeMapping = async (
  providerId: string,
  mappingId: string,
  serverConfig?: ServerConfig
) =>
  recipeImportForgetMappingResponseSchema.parse(
    await request(
      `/mealie/${encodeURIComponent(providerId)}/mappings/${encodeURIComponent(mappingId)}`,
      undefined,
      serverConfig,
      'DELETE'
    )
  );
export const browseRecipes = (
  providerId: string,
  search: string,
  page: number
) =>
  request<RecipeImportBrowseResponse>(
    `/mealie/${encodeURIComponent(providerId)}/recipes?${new URLSearchParams({ search, page: String(page) })}`
  );
export const previewRecipe = (payload: RecipeImportPreviewRequest) =>
  request<RecipeImportPreview>('/mealie/preview', payload);
export const suggestRecipe = (payload: RecipeImportSuggestionRequest) =>
  request<RecipeImportSuggestionResponse>('/mealie/suggest', payload);
export const saveRecipe = (payload: RecipeImportSaveRequest) =>
  request<RecipeImportSaveResponse>('/mealie/save', payload);
export const syncRecipeNutrition = (
  mealId: string,
  serverConfig?: ServerConfig,
  confirmationFingerprint?: string
) =>
  request<RecipeImportSyncResponse>(
    `/${encodeURIComponent(mealId)}/sync-nutrition`,
    confirmationFingerprint ? { confirmationFingerprint } : {},
    serverConfig
  );
export const previewRecipeNutritionSync = (
  mealId: string,
  serverConfig?: ServerConfig
) =>
  request<RecipeImportSyncPreview>(
    `/${encodeURIComponent(mealId)}/sync-preview`,
    undefined,
    serverConfig
  );
export async function fetchRecipeSource(
  mealId: string
): Promise<RecipeImportSource | null> {
  try {
    return await request<RecipeImportSource>(
      `/${encodeURIComponent(mealId)}/source`
    );
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return null;
    throw error;
  }
}
export const fetchRecipeFood = (foodId: string) =>
  apiFetch<FoodItem>({
    endpoint: `/api/foods/${encodeURIComponent(foodId)}`,
    serviceName: 'Foods API',
    operation: 'fetch selected recipe food',
  });
