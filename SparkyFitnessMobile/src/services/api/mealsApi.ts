import { apiFetch } from './apiClient';
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
export const createMeal = async (payload: CreateMealPayload): Promise<Meal> => {
  return apiFetch<Meal>({
    endpoint: '/api/meals',
    serviceName: 'Meals API',
    operation: 'create meal',
    method: 'POST',
    body: payload,
  });
};

/**
 * Updates a meal template and refetches the expanded meal detail.
 */
export const updateMeal = async (id: string, payload: UpdateMealPayload): Promise<Meal> => {
  await apiFetch<Meal>({
    endpoint: `/api/meals/${id}`,
    serviceName: 'Meals API',
    operation: 'update meal',
    method: 'PUT',
    body: payload,
  });

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
