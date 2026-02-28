import { MealTypeDefinition } from '@/types/diary';
import { apiCall } from '../api';

interface MealTypeUpdate {
  name?: string;
  sort_order?: number;
  is_visible?: boolean;
  show_in_quick_log?: boolean;
}

export const getMealTypes = async (): Promise<MealTypeDefinition[]> => {
  const response = await apiCall('/meal-types', {
    method: 'GET',
  });
  return response;
};

export const createMealType = async (data: {
  name: string;
  sort_order: number;
}): Promise<MealTypeDefinition> => {
  const response = await apiCall('/meal-types', {
    method: 'POST',
    body: data,
  });
  return response;
};

export const updateMealType = async (
  id: string,
  updates: MealTypeUpdate
): Promise<MealTypeDefinition> => {
  const response = await apiCall(`/meal-types/${id}`, {
    method: 'PUT',
    body: updates,
  });
  return response;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteMealType = async (id: string): Promise<any> => {
  const response = await apiCall(`/meal-types/${id}`, {
    method: 'DELETE',
  });
  return response;
};
