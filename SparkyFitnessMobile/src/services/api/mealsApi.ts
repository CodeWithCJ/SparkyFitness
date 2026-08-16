import { apiFetch } from './apiClient';
import { postPayloadWithImages } from './imageUploadClient';
import type { ImageUploadArgs } from '../../utils/pickerImages';
import { CreateMealPayload, Meal, MealDeletionImpact, UpdateMealPayload } from '../../types/meals';

/**
 * Fetches all meals for the current user.
 */
export const fetchMeals = async (): Promise<Meal[]> => {
  return apiFetch<Meal[]>({
    endpoint: '/api/meals',
    serviceName: 'Meals API',
    operation: 'fetch meals',
  });
};

/**
 * Fetches a single meal template by ID.
 */
export const fetchMeal = async (id: string): Promise<Meal> => {
  return apiFetch<Meal>({
    endpoint: `/api/meals/${id}`,
    serviceName: 'Meals API',
    operation: 'fetch meal',
  });
};

/**
 * Fetches recently logged meal templates for the current user.
 */
export const fetchRecentMeals = async (limit = 3): Promise<Meal[]> => {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<Meal[]>({
    endpoint: `/api/meals/recent?${params.toString()}`,
    serviceName: 'Meals API',
    operation: 'fetch recent meals',
  });
};

/**
 * Fetches the user's most frequently logged meal templates.
 */
export const fetchTopMeals = async (limit = 3): Promise<Meal[]> => {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<Meal[]>({
    endpoint: `/api/meals/top?${params.toString()}`,
    serviceName: 'Meals API',
    operation: 'fetch top meals',
  });
};

/**
 * Searches meals by name.
 */
export const searchMeals = async (searchTerm: string): Promise<Meal[]> => {
  const params = new URLSearchParams({ searchTerm });
  return apiFetch<Meal[]>({
    endpoint: `/api/meals/search?${params.toString()}`,
    serviceName: 'Meals API',
    operation: 'search meals',
  });
};

/**
 * Creates a meal template for the current user.
 */
export const createMeal = async (
  payload: CreateMealPayload,
  images?: ImageUploadArgs,
): Promise<Meal> => {
  const sendJson = (body: Record<string, unknown>) =>
    apiFetch<Meal>({
      endpoint: '/api/meals',
      serviceName: 'Meals API',
      operation: 'create meal',
      method: 'POST',
      body,
    });

  if (!images) {
    return sendJson(payload as unknown as Record<string, unknown>);
  }

  return postPayloadWithImages<Meal>({
    endpoint: '/api/meals',
    serviceName: 'Meals API',
    operation: 'create meal',
    method: 'POST',
    payload: payload as unknown as Record<string, unknown>,
    wrapperField: 'mealData',
    order: images.order,
    newUris: images.newUris,
    sendJson,
  });
};

/**
 * Updates a meal template and refetches the expanded meal detail.
 */
export const updateMeal = async (
  id: string,
  payload: UpdateMealPayload,
  images?: ImageUploadArgs,
): Promise<Meal> => {
  const sendJson = (body: Record<string, unknown>) =>
    apiFetch<Meal>({
      endpoint: `/api/meals/${id}`,
      serviceName: 'Meals API',
      operation: 'update meal',
      method: 'PUT',
      body,
    });

  if (!images) {
    await sendJson(payload as unknown as Record<string, unknown>);
  } else {
    await postPayloadWithImages<Meal>({
      endpoint: `/api/meals/${id}`,
      serviceName: 'Meals API',
      operation: 'update meal',
      method: 'PUT',
      payload: payload as unknown as Record<string, unknown>,
      wrapperField: 'mealData',
      order: images.order,
      newUris: images.newUris,
      sendJson,
    });
  }

  return fetchMeal(id);
};

/**
 * Deletes a meal template for the current user.
 */
export const deleteMeal = async (id: string): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/meals/${id}`,
    serviceName: 'Meals API',
    operation: 'delete meal',
    method: 'DELETE',
  });
};

/**
 * Fetches the server's deletion impact summary for a meal.
 */
export const fetchMealDeletionImpact = async (id: string): Promise<MealDeletionImpact> => {
  return apiFetch<MealDeletionImpact>({
    endpoint: `/api/meals/${id}/deletion-impact`,
    serviceName: 'Meals API',
    operation: 'fetch meal deletion impact',
  });
};
