import type {
  ExerciseStatsBatchResponse,
  GetPlateInventoryResponse,
  Pagination,
} from '@workspace/shared';
import type {
  WorkoutPreset,
  WorkoutPresetsResponse,
} from '../types/workoutPresets';
import { apiFetch } from '../services/api/apiClient';
import { ApiError } from '../services/api/errors';
import { transformExerciseRow } from '../services/api/exerciseApi';
import { fetchActiveWorkoutPlansFromServer } from '../services/api/workoutPlansApi';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import type { UserPreferences } from '../types/preferences';
import {
  getCacheRow,
  clearCache,
  putCacheRows,
  replaceCacheCollection,
} from './cacheStore';
import {
  CACHE_COLLECTIONS,
  PACK_COMPLETED_KEY,
  SINGLE_DOCUMENT_KEY,
  exerciseStatsCacheKey,
} from './collections';
import { getOfflineDb } from './db';
import { accountGeneration } from './accountGeneration';
import { refreshRecentDiaryDays } from './diaryDay';
import { refreshFoodLibrary } from './foodLibrary';
import { notifyOutboxChanged } from './events';
import { IDENTITY_COLLECTION, IDENTITY_KEY } from './syncEngine';
import type { OfflineDb } from './types';

const SERVICE = 'Offline pack';

/** A refresh newer than this is not repeated unless it is asked for. */
export const PACK_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const PRESET_PAGE_SIZE = 50;
/** The exercise search route's largest page. */
const EXERCISE_PAGE_SIZE = 100;
/** The stats batch route's largest request. */
const STATS_BATCH_SIZE = 100;
/** A runaway guard; no library is this many pages. */
const MAX_PAGES = 500;

interface IdentityResponse {
  authenticatedUserId?: string;
}

/**
 * The requests below go straight to the server on purpose. The ordinary
 * fetchers answer from the phone when the server is away, and a refresh that
 * read its own saved copy back would then overwrite a full collection with
 * whatever part of it happened to be saved.
 */
async function fetchAllPresets(): Promise<WorkoutPreset[]> {
  const presets: WorkoutPreset[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await apiFetch<WorkoutPresetsResponse>({
      endpoint: `/api/workout-presets?page=${page}&limit=${PRESET_PAGE_SIZE}`,
      serviceName: SERVICE,
      operation: 'fetch saved workouts',
    });
    presets.push(...response.presets);
    if (
      response.presets.length === 0 ||
      page * PRESET_PAGE_SIZE >= response.total
    ) {
      break;
    }
  }
  return presets;
}

async function fetchAllExercises() {
  const exercises: ReturnType<typeof transformExerciseRow>[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await apiFetch<{
      exercises: Record<string, unknown>[];
      pagination: Pagination;
    }>({
      endpoint: `/api/v2/exercises/search?page=${page}&pageSize=${EXERCISE_PAGE_SIZE}`,
      serviceName: SERVICE,
      operation: 'fetch exercise library',
    });
    const rows = response.exercises ?? [];
    exercises.push(...rows.map(transformExerciseRow));
    if (rows.length === 0 || !response.pagination.hasMore) break;
  }
  return exercises;
}

/**
 * Last-time values for every exercise in the saved workouts: once scoped to
 * the saved workout (what a workout started from it shows) and once on its
 * own (what an exercise added freely shows).
 */
function statsItemsFor(
  presets: readonly WorkoutPreset[]
): { exerciseId: string; presetId?: number }[] {
  const seen = new Set<string>();
  const items: { exerciseId: string; presetId?: number }[] = [];
  const add = (exerciseId: string, presetId?: number) => {
    const key = exerciseStatsCacheKey(exerciseId, presetId);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(presetId == null ? { exerciseId } : { exerciseId, presetId });
  };
  for (const preset of presets) {
    for (const exercise of preset.exercises ?? []) {
      if (!exercise.exercise_id) continue;
      add(exercise.exercise_id, Number(preset.id));
      add(exercise.exercise_id);
    }
  }
  return items;
}

async function refreshStats(
  db: OfflineDb,
  serverConfigId: string,
  presets: readonly WorkoutPreset[]
): Promise<void> {
  const items = statsItemsFor(presets);
  for (let start = 0; start < items.length; start += STATS_BATCH_SIZE) {
    let response: ExerciseStatsBatchResponse;
    try {
      response = await apiFetch<ExerciseStatsBatchResponse>({
        endpoint: '/api/v2/exercises/stats/batch',
        method: 'POST',
        body: { items: items.slice(start, start + STATS_BATCH_SIZE) },
        serviceName: SERVICE,
        operation: 'fetch last-time values',
      });
    } catch (error) {
      // A server from before this route: last-time values are then kept only
      // for exercises opened while online. Everything else still refreshes.
      if (error instanceof ApiError && error.statusCode === 404) return;
      throw error;
    }
    await putCacheRows(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.exerciseStats,
      response.items.map((item) => ({
        key: exerciseStatsCacheKey(item.exerciseId, item.presetId),
        payload: item.stats,
      }))
    );
  }
}

/** Days of plan kept ahead, today included. */
export const PLAN_DAYS_AHEAD = 14;

/**
 * The plans active on each of the next two weeks, so the diary's plan banner
 * and the watch's "Scheduled today" can start a planned workout offline.
 */
async function refreshPlanDays(
  db: OfflineDb,
  serverConfigId: string
): Promise<void> {
  const today = getTodayDate();
  for (let offset = 0; offset < PLAN_DAYS_AHEAD; offset += 1) {
    const day = addDays(today, offset);
    const plans = await fetchActiveWorkoutPlansFromServer(day);
    await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.planDay, [
      { key: day, payload: plans },
    ]);
  }
}

async function refreshOnce(force: boolean): Promise<boolean> {
  // The account can change while this runs (the switch clears the cache, and
  // every write below would put the previous account's data back), so the
  // number is taken before anything is awaited, not after. A switch of the
  // active server counts too: it goes through the same identity change. A
  // run that finds the account changed throws away what it wrote, on every
  // way out, and does not set the completed marker, so the next trigger
  // refreshes for the new account.
  const startedUnder = accountGeneration();
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return false;
  const db = await getOfflineDb();
  const abandonedAfterSwitch = async (): Promise<boolean> => {
    if (accountGeneration() === startedUnder) return false;
    await clearCache(db, serverConfigId);
    return true;
  };
  try {
    return await refreshSteps(
      db,
      serverConfigId,
      force,
      abandonedAfterSwitch,
      startedUnder
    );
  } catch (error) {
    if (await abandonedAfterSwitch()) return false;
    throw error;
  }
}

async function refreshSteps(
  db: OfflineDb,
  serverConfigId: string,
  force: boolean,
  abandonedAfterSwitch: () => Promise<boolean>,
  startedUnder: number
): Promise<boolean> {
  if (!force) {
    const marker = await getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.pack,
      PACK_COMPLETED_KEY
    );
    if (marker && Date.now() - marker.fetchedAt < PACK_MAX_AGE_MS) return false;
  }

  const identity = await apiFetch<IdentityResponse>({
    endpoint: '/api/identity/user',
    serviceName: SERVICE,
    operation: 'fetch signed-in user',
  });
  if (await abandonedAfterSwitch()) return false;
  if (identity.authenticatedUserId) {
    await putCacheRows(db, serverConfigId, IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: identity.authenticatedUserId } },
    ]);
  }

  const preferences = await apiFetch<UserPreferences>({
    endpoint: '/api/user-preferences',
    serviceName: SERVICE,
    operation: 'fetch preferences',
  });
  if (await abandonedAfterSwitch()) return false;
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.preferences, [
    { key: SINGLE_DOCUMENT_KEY, payload: preferences },
  ]);

  const plates = await apiFetch<GetPlateInventoryResponse>({
    endpoint: '/api/v2/plate-inventory',
    serviceName: SERVICE,
    operation: 'fetch plate inventory',
  });
  if (await abandonedAfterSwitch()) return false;
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.plateInventory, [
    { key: SINGLE_DOCUMENT_KEY, payload: plates },
  ]);

  const presets = await fetchAllPresets();
  if (await abandonedAfterSwitch()) return false;
  await replaceCacheCollection(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.workoutPreset,
    presets.map((preset) => ({
      key: String(preset.id),
      name: preset.name,
      payload: preset,
    }))
  );

  const exercises = await fetchAllExercises();
  if (await abandonedAfterSwitch()) return false;
  await replaceCacheCollection(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.exercise,
    exercises.map((exercise) => ({
      key: exercise.id,
      name: exercise.name,
      payload: exercise,
    }))
  );

  await refreshStats(db, serverConfigId, presets);
  await refreshPlanDays(db, serverConfigId);

  if (await abandonedAfterSwitch()) return false;
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.pack, [
    { key: PACK_COMPLETED_KEY, payload: { completedAt: Date.now() } },
  ]);

  // After the marker: what a workout needs is ready, and a failure here only
  // leaves the Diary with the days it already had.
  try {
    await refreshRecentDiaryDays(db, serverConfigId, undefined, startedUnder);
  } catch (error) {
    addLog(`[Offline] Last week's workouts not refreshed: ${error}`, 'WARNING');
  }
  // Also after the marker: the foods are for logging food, and a failure here
  // leaves the library the phone already had.
  try {
    await refreshFoodLibrary(db, serverConfigId, startedUnder);
  } catch (error) {
    addLog(`[Offline] Foods not refreshed: ${error}`, 'WARNING');
  }
  if (await abandonedAfterSwitch()) return false;
  return true;
}

let running: Promise<boolean> | null = null;

/**
 * Downloads what a workout needs so it can be started with no connection:
 * saved workouts, the exercise library, last-time values, preferences and
 * the plate inventory. Runs at most every six hours unless `force` is set,
 * one run at a time. Never throws: a server that stops answering part-way
 * leaves what was already saved in place, and the next run starts again.
 *
 * Resolves true when a full refresh completed.
 */
export function refreshOfflinePack(
  options: { force?: boolean } = {}
): Promise<boolean> {
  running ??= refreshOnce(options.force === true)
    .catch((error: unknown) => {
      addLog(`[Offline] Refresh of saved data stopped: ${error}`, 'WARNING');
      return false;
    })
    .finally(() => {
      running = null;
      notifyOutboxChanged();
    });
  return running;
}

/**
 * True when this phone has completed a refresh for the server and holds its
 * preferences. A workout is only started offline when this holds, because
 * the weight unit comes from those preferences.
 */
export async function isOfflinePackReady(
  db: OfflineDb,
  serverConfigId: string
): Promise<boolean> {
  const [marker, preferences] = await Promise.all([
    getCacheRow(db, serverConfigId, CACHE_COLLECTIONS.pack, PACK_COMPLETED_KEY),
    getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.preferences,
      SINGLE_DOCUMENT_KEY
    ),
  ]);
  return marker != null && preferences != null;
}
