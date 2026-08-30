import { apiCall } from '../api';
import { buildPayloadRequest } from '../imageRequest';
import type {
  Meal,
  MealPayload,
  MealDeletionImpact,
  MealFilter,
} from '@/types/meal';

/** The server's parseMealBody unwraps the payload from a `mealData` field. */
const buildMealRequest = (payload: Partial<MealPayload>, imageFiles?: File[]) =>
  buildPayloadRequest(
    payload as Record<string, unknown>,
    'mealData',
    imageFiles
  );

export const createMeal = async (
  mealData: MealPayload,
  imageFiles?: File[]
): Promise<Meal> => {
  return await apiCall(`/meals`, {
    method: 'POST',
    ...buildMealRequest(mealData, imageFiles),
  });
};

interface MealParams {
  filter: string;
  searchTerm?: string;
}

export const getMeals = async (
  filter: MealFilter = 'all',
  searchTerm: string = ''
): Promise<Meal[]> => {
  let url = `/meals`;
  const params: MealParams = { filter };

  if (searchTerm) {
    url = `/meals/search`;
    params.searchTerm = searchTerm;
  }

  return await apiCall(url, { method: 'GET', params });
};

export const getMealById = async (mealId: string): Promise<Meal> => {
  return await apiCall(`/meals/${mealId}`, { method: 'GET' });
};

// Recently logged meal templates, for the food-search landing quick-pick list.
export const getRecentMeals = async (limit = 3): Promise<Meal[]> => {
  return await apiCall(`/meals/recent`, {
    method: 'GET',
    params: { limit: String(limit) },
  });
};

// Most frequently logged meal templates, ranked by usage count.
export const getTopMeals = async (limit = 3): Promise<Meal[]> => {
  return await apiCall(`/meals/top`, {
    method: 'GET',
    params: { limit: String(limit) },
  });
};

export const updateMeal = async (
  mealId: string,
  mealData: Partial<MealPayload>,
  imageFiles?: File[]
): Promise<Meal> => {
  return await apiCall(`/meals/${mealId}`, {
    method: 'PUT',
    ...buildMealRequest(mealData, imageFiles),
  });
};

export const deleteMeal = async (
  mealId: string,
  force: boolean = false
): Promise<{ message: string }> => {
  const params = new URLSearchParams();
  if (force) {
    params.append('force', 'true');
  }
  return await apiCall(`/meals/${mealId}?${params.toString()}`, {
    method: 'DELETE',
  });
};

export const getMealDeletionImpact = async (
  mealId: string
): Promise<MealDeletionImpact> => {
  return await apiCall(`/meals/${mealId}/deletion-impact`, { method: 'GET' });
};

export const createMealFromDiary = async (
  date: string,
  mealType: string,
  mealName: string,
  description: string | null,
  isPublic: boolean
): Promise<Meal> => {
  return await apiCall(`/meals/create-meal-from-diary`, {
    method: 'POST',
    body: { date, mealType, mealName, description, isPublic },
  });
};
