import { api } from './api';
import type { MealPlanTemplate } from '@/types/meal';

export const getMealPlanTemplates = async (userId: string): Promise<MealPlanTemplate[]> => {
    return await api.get(`/meal-plan-templates?userId=${userId}`);
};

export const createMealPlanTemplate = async (userId: string, templateData: Partial<MealPlanTemplate>, currentClientDate?: string): Promise<MealPlanTemplate> => {
    return await api.post('/meal-plan-templates', { body: { ...templateData, userId, currentClientDate } });
};

export const updateMealPlanTemplate = async (userId: string, templateId: string, templateData: Partial<MealPlanTemplate>, currentClientDate?: string): Promise<MealPlanTemplate> => {
    return await api.put(`/meal-plan-templates/${templateId}`, { body: { ...templateData, userId, currentClientDate } });
};

export const deleteMealPlanTemplate = async (userId: string, templateId: string): Promise<void> => {
    await api.delete(`/meal-plan-templates/${templateId}?userId=${userId}`);
};

export const getMealDayPresets = async (userId: string): Promise<[]> => {
    const response = await api.get(`/meal-plan-templates/presets?userId=${userId}`);
    return response.data;
};
