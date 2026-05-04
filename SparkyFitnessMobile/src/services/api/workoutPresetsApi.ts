import { apiFetch } from './apiClient';
import type { WorkoutPresetsResponse, WorkoutPreset } from '../../types/workoutPresets';

export interface WorkoutPresetSetPayload {
  set_number: number;
  set_type: string;
  reps: number | null;
  weight: number | null;
  duration: number | null;
  rest_time: number | null;
  notes: string | null;
}

export interface WorkoutPresetExercisePayload {
  exercise_id: string;
  image_url: string | null;
  sort_order: number;
  sets: WorkoutPresetSetPayload[];
}

export interface WorkoutPresetCreatePayload {
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  exercises: WorkoutPresetExercisePayload[];
}

export interface WorkoutPresetUpdatePayload {
  name?: string;
  description?: string;
  is_public?: boolean;
  exercises?: WorkoutPresetExercisePayload[];
}

export const fetchWorkoutPresets = async (): Promise<WorkoutPresetsResponse> => {
  return apiFetch<WorkoutPresetsResponse>({
    endpoint: '/api/workout-presets?limit=50',
    serviceName: 'Workout Presets API',
    operation: 'fetch workout presets',
  });
};

export interface FetchWorkoutPresetsPageOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedWorkoutPresetsPage {
  presets: WorkoutPreset[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}

export const fetchWorkoutPresetsPage = async ({
  page = 1,
  pageSize = 20,
}: FetchWorkoutPresetsPageOptions = {}): Promise<PaginatedWorkoutPresetsPage> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });
  const response = await apiFetch<WorkoutPresetsResponse>({
    endpoint: `/api/workout-presets?${params.toString()}`,
    serviceName: 'Workout Presets API',
    operation: 'fetch workout presets page',
  });
  return {
    presets: response.presets,
    pagination: {
      page,
      pageSize,
      totalCount: response.total,
      hasMore: page * pageSize < response.total,
    },
  };
};

export const searchWorkoutPresets = async (
  searchTerm: string,
  options: { limit?: number } = {},
): Promise<WorkoutPreset[]> => {
  const params = new URLSearchParams({ searchTerm });
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  return apiFetch<WorkoutPreset[]>({
    endpoint: `/api/workout-presets/search?${params.toString()}`,
    serviceName: 'Workout Presets API',
    operation: 'search workout presets',
  });
};

export const createWorkoutPreset = async (
  body: WorkoutPresetCreatePayload,
): Promise<WorkoutPreset> => {
  return apiFetch<WorkoutPreset>({
    endpoint: '/api/workout-presets',
    method: 'POST',
    body,
    serviceName: 'Workout Presets API',
    operation: 'create workout preset',
  });
};

export const updateWorkoutPreset = async (
  id: string,
  body: WorkoutPresetUpdatePayload,
): Promise<WorkoutPreset> => {
  return apiFetch<WorkoutPreset>({
    endpoint: `/api/workout-presets/${id}`,
    method: 'PUT',
    body,
    serviceName: 'Workout Presets API',
    operation: 'update workout preset',
  });
};

export const deleteWorkoutPreset = async (id: string): Promise<{ message: string }> => {
  return apiFetch<{ message: string }>({
    endpoint: `/api/workout-presets/${id}`,
    method: 'DELETE',
    serviceName: 'Workout Presets API',
    operation: 'delete workout preset',
  });
};
