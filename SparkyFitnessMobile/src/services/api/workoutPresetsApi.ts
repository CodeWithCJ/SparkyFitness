import type {
  WorkoutPresetCreateRequest,
  WorkoutPresetExerciseRequest,
  WorkoutPresetSetRequest,
  WorkoutPresetUpdateRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import {
  listCacheRows,
  getCacheRow,
  putCacheRows,
  searchCacheRows,
  type CacheWrite,
} from '../../offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../offline/collections';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import type { OfflineDb } from '../../offline/types';
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

const presetCacheRows = (presets: readonly WorkoutPreset[]): CacheWrite[] =>
  presets.map((preset) => ({
    key: String(preset.id),
    name: preset.name,
    payload: preset,
  }));

const storePresets = (
  db: OfflineDb,
  serverConfigId: string,
  presets: readonly WorkoutPreset[]
) =>
  putCacheRows(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.workoutPreset,
    presetCacheRows(presets)
  );

/** Every saved workout kept on the phone, by name; null when none are. */
async function readSavedPresets(
  db: OfflineDb,
  serverConfigId: string
): Promise<WorkoutPreset[] | null> {
  const rows = await listCacheRows(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.workoutPreset
  );
  return rows.length > 0
    ? rows.map((row) => row.payload as WorkoutPreset)
    : null;
}

export const fetchWorkoutPresets = async (): Promise<WorkoutPresetsResponse> =>
  withOfflineFallback<WorkoutPresetsResponse>({
    fetch: () =>
      apiFetch<WorkoutPresetsResponse>({
        endpoint: '/api/workout-presets?limit=50',
        serviceName: 'Workout Presets API',
        operation: 'fetch workout presets',
      }),
    store: (db, serverConfigId, response) =>
      storePresets(db, serverConfigId, response.presets),
    read: async (db, serverConfigId) => {
      const presets = await readSavedPresets(db, serverConfigId);
      if (!presets) return null;
      return {
        presets: presets.slice(0, 50),
        total: presets.length,
        page: 1,
        limit: 50,
      };
    },
  });

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
  const response = await withOfflineFallback<WorkoutPresetsResponse>({
    fetch: () =>
      apiFetch<WorkoutPresetsResponse>({
        endpoint: `/api/workout-presets?${params.toString()}`,
        serviceName: 'Workout Presets API',
        operation: 'fetch workout presets page',
      }),
    store: (db, serverConfigId, value) =>
      storePresets(db, serverConfigId, value.presets),
    read: async (db, serverConfigId) => {
      const presets = await readSavedPresets(db, serverConfigId);
      if (!presets) return null;
      const start = (page - 1) * pageSize;
      return {
        presets: presets.slice(start, start + pageSize),
        total: presets.length,
        page,
        limit: pageSize,
      };
    },
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
  return withOfflineFallback<WorkoutPreset[]>({
    fetch: () =>
      apiFetch<WorkoutPreset[]>({
        endpoint: `/api/workout-presets/search?${params.toString()}`,
        serviceName: 'Workout Presets API',
        operation: 'search workout presets',
      }),
    store: storePresets,
    read: async (db, serverConfigId) => {
      // Search what is saved by name. Null (no fallback) only when nothing
      // is saved at all; "saved, but no match" is a real empty answer.
      const saved = await readSavedPresets(db, serverConfigId);
      if (!saved) return null;
      const rows = await searchCacheRows(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.workoutPreset,
        searchTerm,
        options.limit ?? 50
      );
      return rows.map((row) => row.payload as WorkoutPreset);
    },
  });
};

export const getWorkoutPresetById = async (
  id: number
): Promise<WorkoutPreset> => {
  return withOfflineFallback<WorkoutPreset>({
    fetch: () =>
      apiFetch<WorkoutPreset>({
        endpoint: `/api/workout-presets/${id}`,
        serviceName: 'Workout Presets API',
        operation: 'fetch workout preset',
      }),
    store: (db, serverConfigId, preset) =>
      storePresets(db, serverConfigId, [preset]),
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.workoutPreset,
        String(id)
      );
      return row ? (row.payload as WorkoutPreset) : null;
    },
  });
};

export const createWorkoutPreset = async (
  body: WorkoutPresetCreatePayload
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
  id: number,
  body: WorkoutPresetUpdatePayload
): Promise<WorkoutPreset> => {
  return apiFetch<WorkoutPreset>({
    endpoint: `/api/workout-presets/${id}`,
    method: 'PUT',
    body,
    serviceName: 'Workout Presets API',
    operation: 'update workout preset',
  });
};

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
