import { apiFetch } from './apiClient';
import { Meal } from '../../types/meals';

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
