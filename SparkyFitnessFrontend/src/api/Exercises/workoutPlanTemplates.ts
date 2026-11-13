import { apiCall } from '@/api/api';
import type { WorkoutPlanTemplate } from '@/types/workout';

export const getWorkoutPlanTemplates = async (): Promise<
  WorkoutPlanTemplate[]
> => {
  return apiCall('/workout-plan-templates', {
    method: 'GET',
  });
};

export const createWorkoutPlanTemplate = async (
  userId: string,
  planData: Omit<
    WorkoutPlanTemplate,
    'id' | 'user_id' | 'created_at' | 'updated_at'
  >
): Promise<WorkoutPlanTemplate> => {
  return apiCall('/workout-plan-templates', {
    method: 'POST',
    body: JSON.stringify({ ...planData, user_id: userId }),
  });
};

/**
 * The updated plan plus the diary regeneration outcome: the save itself
 * commits, but prefill regeneration can fail afterwards, which the caller
 * must surface (workoutPlanTemplateService resolves with this flag).
 */
export type UpdateWorkoutPlanTemplateResult = WorkoutPlanTemplate & {
  regeneration_failed?: boolean;
  regenerated_entries?: { created: number; removed: number };
};

export const updateWorkoutPlanTemplate = async (
  id: string,
  planData: Partial<WorkoutPlanTemplate>
): Promise<UpdateWorkoutPlanTemplateResult> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(planData),
  });
};

export const deleteWorkoutPlanTemplate = async (
  id: string
): Promise<{ message: string }> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'DELETE',
  });
};

export const getActiveWorkoutPlans = async (
  date: string
): Promise<WorkoutPlanTemplate[]> => {
  const data = await apiCall(`/workout-plan-templates/active/${date}`, {
    method: 'GET',
  });
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
};
