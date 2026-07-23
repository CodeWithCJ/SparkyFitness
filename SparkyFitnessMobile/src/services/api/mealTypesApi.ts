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
