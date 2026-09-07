import { MealTypeDefinition } from '@/types/diary';
import { apiCall } from '../api';

interface MealTypeUpdate {
  name?: string;
  sort_order?: number;
  is_visible?: boolean;
  show_in_quick_log?: boolean;
  default_time?: string | null;
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
  default_time?: string | null;
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

export type MealTypeDeleteMode = 'strict' | 'reassign' | 'force';

export interface MealTypeDeletionImpact {
  foodEntries: number;
  foodEntryMeals: number;
  mealPlans: number;
  templateAssignments: number;
  totalReferences: number;
}

export interface DeleteMealTypeOptions {
  mode?: MealTypeDeleteMode;
  reassignTo?: string;
}

export const getMealTypeDeletionImpact = async (
  id: string
): Promise<MealTypeDeletionImpact> => {
  const response = await apiCall(`/meal-types/${id}/deletion-impact`, {
    method: 'GET',
  });
  return response;
};

export const deleteMealType = async (
  id: string,
  options: DeleteMealTypeOptions = {}
): Promise<unknown> => {
  const params = new URLSearchParams();
  if (options.mode) params.set('mode', options.mode);
  if (options.reassignTo) params.set('reassignTo', options.reassignTo);
  const query = params.toString();
  const response = await apiCall(
    `/meal-types/${id}${query ? `?${query}` : ''}`,
    {
      method: 'DELETE',
    }
  );
  return response;
};
