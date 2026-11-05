import type {
  WorkoutPresetCreateRequest,
  WorkoutPresetExerciseRequest,
  WorkoutPresetSetRequest,
  WorkoutPresetUpdateRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import type {
  WorkoutPresetsResponse,
  WorkoutPreset,
} from '../../types/workoutPresets';

// Payload shapes are the shared request schemas the server validates against;
// these aliases keep the mobile-local names the hooks were written against.
export type WorkoutPresetSetPayload = WorkoutPresetSetRequest;
export type WorkoutPresetExercisePayload = WorkoutPresetExerciseRequest;
export type WorkoutPresetCreatePayload = WorkoutPresetCreateRequest;
export type WorkoutPresetUpdatePayload = WorkoutPresetUpdateRequest;

export const fetchWorkoutPresets =
  async (): Promise<WorkoutPresetsResponse> => {
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
  options: { limit?: number } = {}
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

export const getWorkoutPresetById = async (
  id: number
): Promise<WorkoutPreset> => {
  return apiFetch<WorkoutPreset>({
    endpoint: `/api/workout-presets/${id}`,
    serviceName: 'Workout Presets API',
    operation: 'fetch workout preset',
  });
};

const usesRangeProgression = (
  exercises: readonly WorkoutPresetExercisePayload[] | undefined
): boolean =>
  (exercises ?? []).some(
    (e) => e.progression_mode === 'double' || e.progression_mode === 'triple'
  );

/**
 * Servers older than double/triple progression reject those modes with a
 * 400. Fixed Target on the top of the range is the closest older mode (every
 * set at the top adds weight), so the preset still saves; the server drops
 * rep_range_min, which it doesn't know either.
 */
function withoutRangeProgression<
  T extends { exercises?: WorkoutPresetExercisePayload[] },
>(body: T): T {
  return {
    ...body,
    exercises: body.exercises?.map((e) =>
      e.progression_mode === 'double' || e.progression_mode === 'triple'
        ? { ...e, progression_mode: 'fixed', increment_type: 'weight' }
        : e
    ),
  };
}

/** Send once; on a 400 for a body using double/triple, retry for an older server. */
async function sendWithRangeFallback<
  T extends { exercises?: WorkoutPresetExercisePayload[] },
>(body: T, send: (body: T) => Promise<WorkoutPreset>): Promise<WorkoutPreset> {
  try {
    return await send(body);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.statusCode === 400 &&
      usesRangeProgression(body.exercises)
    ) {
      return send(withoutRangeProgression(body));
    }
    throw error;
  }
}

export const createWorkoutPreset = async (
  body: WorkoutPresetCreatePayload
): Promise<WorkoutPreset> =>
  sendWithRangeFallback(body, (payload) =>
    apiFetch<WorkoutPreset>({
      endpoint: '/api/workout-presets',
      method: 'POST',
      body: payload,
      serviceName: 'Workout Presets API',
      operation: 'create workout preset',
    })
  );

export const updateWorkoutPreset = async (
  id: number,
  body: WorkoutPresetUpdatePayload
): Promise<WorkoutPreset> =>
  sendWithRangeFallback(body, (payload) =>
    apiFetch<WorkoutPreset>({
      endpoint: `/api/workout-presets/${id}`,
      method: 'PUT',
      body: payload,
      serviceName: 'Workout Presets API',
      operation: 'update workout preset',
    })
  );

export const deleteWorkoutPreset = async (
  id: number
): Promise<{ message: string }> => {
  return apiFetch<{ message: string }>({
    endpoint: `/api/workout-presets/${id}`,
    method: 'DELETE',
    serviceName: 'Workout Presets API',
    operation: 'delete workout preset',
  });
};
