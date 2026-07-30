import { apiFetch } from './apiClient';
import { MealType } from '../../types/mealTypes';

/**
 * Fetches all meal types for the current user.
 */
export const fetchMealTypes = async (): Promise<MealType[]> => {
  return apiFetch<MealType[]>({
    endpoint: '/api/meal-types',
    serviceName: 'Meal Types API',
    operation: 'fetch meal types',
  });
};

/**
 * Updates a meal type by ID.
 */
export const updateMealType = async (
  id: string,
  data: Partial<Omit<MealType, 'id'>>
): Promise<MealType> => {
  return apiFetch<MealType>({
    endpoint: `/api/meal-types/${id}`,
    method: 'PUT',
    body: data,
    serviceName: 'Meal Types API',
    operation: 'update meal type',
  });
};

/**
 * Creates a new custom meal type.
 */
export const createMealType = async (
  data: Pick<MealType, 'name' | 'sort_order'> & Partial<Omit<MealType, 'id' | 'name' | 'sort_order'>>
): Promise<MealType> => {
  return apiFetch<MealType>({
    endpoint: '/api/meal-types',
    method: 'POST',
    body: data,
    serviceName: 'Meal Types API',
    operation: 'create meal type',
  });
};

/**
 * Deletes a custom meal type by ID.
 */
export const deleteMealType = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/meal-types/${id}`,
    method: 'DELETE',
    serviceName: 'Meal Types API',
    operation: 'delete meal type',
  });
};
