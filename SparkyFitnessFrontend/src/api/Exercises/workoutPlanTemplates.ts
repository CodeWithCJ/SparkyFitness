import { apiCall } from '@/api/api';
import type { WorkoutPlanTemplate } from '@/types/workout';
import {
  CreateWorkoutPlanTemplatesRequest,
  UpdateWorkoutPlanTemplatesRequest,
  workoutPlanTemplatesResponseSchema,
} from '@workspace/shared';
import { z } from 'zod';

export const getWorkoutPlanTemplates = async (): Promise<
  WorkoutPlanTemplate[]
> => {
  const response = await apiCall('/workout-plan-templates', {
    method: 'GET',
  });
  return z
    .array(workoutPlanTemplatesResponseSchema)
    .parse(response) as unknown as WorkoutPlanTemplate[];
};

export const createWorkoutPlanTemplate = async (
  planData: CreateWorkoutPlanTemplatesRequest
): Promise<WorkoutPlanTemplate> => {
  const response = await apiCall('/workout-plan-templates', {
    method: 'POST',
    body: JSON.stringify(planData),
  });
  return workoutPlanTemplatesResponseSchema.parse(
    response
  ) as unknown as WorkoutPlanTemplate;
};

export const updateWorkoutPlanTemplate = async (
  id: string,
  planData: UpdateWorkoutPlanTemplatesRequest
): Promise<WorkoutPlanTemplate> => {
  const response = await apiCall(`/workout-plan-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(planData),
  });
  return workoutPlanTemplatesResponseSchema.parse(
    response
  ) as unknown as WorkoutPlanTemplate;
};

export const deleteWorkoutPlanTemplate = async (
  id: string
): Promise<{ message: string }> => {
  return apiCall(`/workout-plan-templates/${id}`, {
    method: 'DELETE',
  });
};
