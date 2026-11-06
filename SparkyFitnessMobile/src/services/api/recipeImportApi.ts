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
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError, getApiErrorMessage } from './errors';
import type { FoodItem } from '../../types/foods';

const root = '/api/v2/recipe-imports';
async function request<T>(endpoint: string, body?: unknown): Promise<T> {
  try {
    return await apiFetch<T>({
      endpoint: root + endpoint,
      serviceName: 'Recipe Imports API',
      operation: 'access recipe import',
      ...(body === undefined ? {} : { method: 'POST', body }),
    });
  } catch (error) {
    const message = getApiErrorMessage(error);
    if (message && error instanceof ApiError)
      throw new ApiError(message, error.statusCode, error.body);
    throw error;
  }
}
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
export const syncRecipeNutrition = (mealId: string) =>
  request<RecipeImportSyncResponse>(
    `/${encodeURIComponent(mealId)}/sync-nutrition`,
    {}
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
