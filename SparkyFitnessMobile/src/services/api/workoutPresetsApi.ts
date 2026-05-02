import { apiFetch } from './apiClient';
import type { WorkoutPresetsResponse, WorkoutPreset } from '../../types/workoutPresets';

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
