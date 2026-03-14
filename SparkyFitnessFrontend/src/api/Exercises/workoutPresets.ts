import { apiCall } from '@/api/api';
import type { PaginatedWorkoutPresets, WorkoutPreset } from '@/types/workout';
import {
  CreateWorkoutPresetsRequest,
  UpdateWorkoutPresetsRequest,
  workoutPresetsResponseSchema,
} from '@workspace/shared';
import { z } from 'zod';

export const getWorkoutPresets = async (
  page: number,
  limit: number
): Promise<PaginatedWorkoutPresets> => {
  const response = await apiCall('/workout-presets', {
    method: 'GET',
    params: { page, limit },
  });
  return z
    .object({
      presets: z.array(workoutPresetsResponseSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
    })
    .parse(response) as unknown as PaginatedWorkoutPresets;
};

export const getWorkoutPresetById = async (
  id: string
): Promise<WorkoutPreset> => {
  const response = await apiCall(`/workout-presets/${id}`, {
    method: 'GET',
  });
  return workoutPresetsResponseSchema.parse(
    response
  ) as unknown as WorkoutPreset;
};

export const createWorkoutPreset = async (
  presetData: CreateWorkoutPresetsRequest
): Promise<WorkoutPreset> => {
  const response = await apiCall('/workout-presets', {
    method: 'POST',
    body: JSON.stringify(presetData),
  });
  return workoutPresetsResponseSchema.parse(
    response
  ) as unknown as WorkoutPreset;
};

export const updateWorkoutPreset = async (
  id: string,
  presetData: UpdateWorkoutPresetsRequest
): Promise<WorkoutPreset> => {
  const response = await apiCall(`/workout-presets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(presetData),
  });
  return workoutPresetsResponseSchema.parse(
    response
  ) as unknown as WorkoutPreset;
};

export const deleteWorkoutPreset = async (
  id: string
): Promise<{ message: string }> => {
  return apiCall(`/workout-presets/${id}`, {
    method: 'DELETE',
  });
};

interface WorkoutSearchParams {
  searchTerm: string;
  limit?: number;
}

export const searchWorkoutPresets = async (
  searchTerm: string,
  limit?: number
): Promise<WorkoutPreset[]> => {
  const params: WorkoutSearchParams = { searchTerm };
  if (limit !== undefined) {
    params.limit = limit;
  }
  const response = await apiCall('/workout-presets/search', {
    method: 'GET',
    params: params,
  });
  return z
    .array(workoutPresetsResponseSchema)
    .parse(response) as unknown as WorkoutPreset[];
};
