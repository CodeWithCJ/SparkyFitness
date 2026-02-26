import { apiCall } from '../api';
import type {
  Meal,
  MealPayload,
  MealPlanTemplate,
  MealDeletionImpact,
} from '@/types/meal';

export type MealFilter = 'all' | 'mine' | 'family' | 'public' | 'needs-review';

export const createMeal = async (mealData: MealPayload): Promise<Meal> => {
  return await apiCall(`/meals`, { method: 'POST', body: mealData });
};

export const getMeals = async (
  filter: MealFilter = 'all',
  searchTerm: string = ''
): Promise<Meal[]> => {
  let url = `/meals`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: { [key: string]: any } = { filter };

  if (searchTerm) {
    url = `/meals/search`;
    params.searchTerm = searchTerm;
  }

  return await apiCall(url, { method: 'GET', params });
};

export const getMealById = async (mealId: string): Promise<Meal> => {
  return await apiCall(`/meals/${mealId}`, { method: 'GET' });
};

export const updateMeal = async (
  mealId: string,
  mealData: Partial<MealPayload>
): Promise<Meal> => {
  return await apiCall(`/meals/${mealId}`, { method: 'PUT', body: mealData });
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

export const createMealPlanEntry = async (
  planData: MealPlanTemplate
): Promise<MealPlanTemplate> => {
  return await apiCall(`/meals/plan`, { method: 'POST', body: planData });
};

export const getMealPlanEntries = async (
  startDate: string,
  endDate: string
): Promise<MealPlanTemplate[]> => {
  const response = await apiCall(`/meals/plan`, {
    method: 'GET',
    params: { startDate, endDate },
  });
  return Array.isArray(response) ? response : [];
};

export const updateMealPlanEntry = async (
  planId: string,
  planData: MealPlanTemplate
): Promise<MealPlanTemplate> => {
  return await apiCall(`/meals/plan/${planId}`, {
    method: 'PUT',
    body: planData,
  });
};

export const deleteMealPlanEntry = async (planId: string): Promise<void> => {
  await apiCall(`/meals/plan/${planId}`, { method: 'DELETE' });
};

export const logMealPlanEntryToDiary = async (
  mealPlanId: string,
  targetDate?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> => {
  return await apiCall(`/meals/plan/${mealPlanId}/log-to-diary`, {
    method: 'POST',
    body: { target_date: targetDate },
  });
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
