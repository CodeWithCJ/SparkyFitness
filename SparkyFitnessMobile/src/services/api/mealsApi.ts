import { apiFetch } from './apiClient';
import { CreateMealPayload, Meal } from '../../types/meals';

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
