import { api } from '@/api/api';
import type { MealPlanTemplate } from '@/types/meal';

export const getMealPlanTemplates = async (
  userId: string
): Promise<MealPlanTemplate[]> => {
  return await api.get(`/meal-plan-templates?userId=${userId}`);
};

export const createMealPlanTemplate = async (
  userId: string,
  templateData: Partial<MealPlanTemplate>,
  currentClientDate?: string
): Promise<MealPlanTemplate> => {
  // rename assignments to day_presets because of backend inconsistencies
  const { assignments, ...restData } = templateData;
  return await api.post('/meal-plan-templates', {
    body: {
      ...restData,
      day_presets: assignments,
      userId,
      currentClientDate,
    },
  });
};

export const updateMealPlanTemplate = async (
  userId: string,
  templateData: Partial<MealPlanTemplate>,
  currentClientDate?: string
): Promise<MealPlanTemplate> => {
  if (!templateData.id) {
    throw new Error('TemplateId is undefined');
  }
  return await api.put(`/meal-plan-templates/${templateData.id}`, {
    body: { ...templateData, userId, currentClientDate },
  });
};

export const deleteMealPlanTemplate = async (
  userId: string,
  templateId: string,
  currentClientDate?: string
): Promise<void> => {
  let url = `/meal-plan-templates/${templateId}?userId=${userId}`;
  if (currentClientDate) {
    url += `&currentClientDate=${currentClientDate}`;
  }
  await api.delete(url);
};

export const getMealDayPresets = async (userId: string): Promise<[]> => {
  const response = await api.get(
    `/meal-plan-templates/presets?userId=${userId}`
  );
  return response.data;
};
