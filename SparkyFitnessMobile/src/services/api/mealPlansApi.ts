import type { MealPlanTemplate, SaveMealPlanPayload } from '../../types/mealPlans';
import { apiFetch } from './apiClient';

const SERVICE_NAME = 'Meal Plans API';

export async function fetchMealPlans(): Promise<MealPlanTemplate[]> {
  return apiFetch<MealPlanTemplate[]>({
    endpoint: '/api/meal-plan-templates',
    serviceName: SERVICE_NAME,
    operation: 'fetch meal plans',
  });
}

export async function createMealPlan(
  payload: SaveMealPlanPayload,
  currentClientDate: string,
): Promise<MealPlanTemplate> {
  return apiFetch<MealPlanTemplate>({
    endpoint: '/api/meal-plan-templates',
    serviceName: SERVICE_NAME,
    operation: 'create meal plan',
    method: 'POST',
    body: { ...payload, currentClientDate },
  });
}

export async function updateMealPlan(
  id: string,
  payload: SaveMealPlanPayload,
  currentClientDate: string,
): Promise<MealPlanTemplate> {
  return apiFetch<MealPlanTemplate>({
    endpoint: `/api/meal-plan-templates/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update meal plan',
    method: 'PUT',
    body: { ...payload, currentClientDate },
  });
}

export async function duplicateMealPlan(
  id: string,
  currentClientDate: string,
): Promise<MealPlanTemplate> {
  return apiFetch<MealPlanTemplate>({
    endpoint: `/api/meal-plan-templates/${id}/duplicate`,
    serviceName: SERVICE_NAME,
    operation: 'duplicate meal plan',
    method: 'POST',
    body: { currentClientDate },
  });
}

export async function deleteMealPlan(id: string, currentClientDate: string): Promise<void> {
  const params = new URLSearchParams({ currentClientDate });
  return apiFetch<void>({
    endpoint: `/api/meal-plan-templates/${id}?${params.toString()}`,
    serviceName: SERVICE_NAME,
    operation: 'delete meal plan',
    method: 'DELETE',
  });
}
