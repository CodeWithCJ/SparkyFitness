import { apiCall } from './api';
import type { WorkoutPlanTemplate } from '@/types/workout';

export const getWorkoutPlanTemplates = async (): Promise<WorkoutPlanTemplate[]> => {
  return apiCall('/workout-plan-templates', {
    method: 'GET',
  });
};

export const getWorkoutPlanTemplateById = async (id: string): Promise<WorkoutPlanTemplate> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'GET',
  });
};

export const createWorkoutPlanTemplate = async (userId: string, planData: Omit<WorkoutPlanTemplate, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<WorkoutPlanTemplate> => {
  return apiCall('/workout-plan-templates', {
    method: 'POST',
    body: JSON.stringify({ ...planData, user_id: userId }),
  });
};

export const updateWorkoutPlanTemplate = async (id: string, planData: Partial<WorkoutPlanTemplate>): Promise<WorkoutPlanTemplate> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(planData),
  });
};

export const deleteWorkoutPlanTemplate = async (id: string): Promise<{ message: string }> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'DELETE',
  });
};

export const getActiveWorkoutPlanForDate = async (date: string): Promise<WorkoutPlanTemplate | null> => {
  return apiCall(`/workout-plan-templates/active/${date}`, {
    method: 'GET',
  });
};