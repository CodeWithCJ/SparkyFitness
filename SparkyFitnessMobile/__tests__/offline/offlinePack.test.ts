import { ApiError } from '../../src/services/api/errors';
import { apiFetch } from '../../src/services/api/apiClient';
import {
  getCacheRow,
  listCacheRows,
  putCacheRows,
} from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  PACK_COMPLETED_KEY,
  SINGLE_DOCUMENT_KEY,
  exerciseStatsCacheKey,
} from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  PACK_MAX_AGE_MS,
  PLAN_DAYS_AHEAD,
  isOfflinePackReady,
  refreshOfflinePack,
} from '../../src/offline/offlinePack';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';
import { getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const EXERCISE_A = '11111111-1111-4111-8111-111111111111';
const emptyStats = { bestSet: null, lastSet: null, recentSessions: [] };

interface ServerState {
  presets: { id: number; name: string; exercises: { exercise_id: string }[] }[];
  exercises: { id: string; name: string }[];
  batchStatus?: number;
  failOn?: string;
}

function serveFrom(state: ServerState) {
  mockApiFetch.mockImplementation((async ({
    endpoint,
    body,
  }: {
    endpoint: string;
    body?: { items: { exerciseId: string; presetId?: number }[] };
  }) => {
    if (state.failOn && endpoint.startsWith(state.failOn)) {
      throw new TypeError('Network request failed');
    }
    if (endpoint === '/api/identity/user') {
      return { authenticatedUserId: 'u1' };
    }
    if (endpoint === '/api/user-preferences') {
      return { default_weight_unit: 'lbs' };
    }
    if (endpoint === '/api/v2/plate-inventory') return { inventory: null };
    if (endpoint.startsWith('/api/workout-plan-templates/active/')) {
      return [{ id: 'plan-1', name: 'Plan' }];
    }
    if (endpoint.startsWith('/api/workout-presets')) {
      return { presets: state.presets, total: state.presets.length };
    }
    if (endpoint.startsWith('/api/v2/exercises/search')) {
      return {
        exercises: state.exercises,
        pagination: { page: 1, pageSize: 100, totalCount: 1, hasMore: false },
      };
    }
    if (endpoint === '/api/v2/exercises/stats/batch') {
      if (state.batchStatus) throw new ApiError('nope', state.batchStatus);
      return {
        items: body!.items.map((item) => ({
          exerciseId: item.exerciseId,
          presetId: item.presetId ?? null,
          stats: emptyStats,
        })),
      };
    }
    throw new Error(`unexpected request ${endpoint}`);
  }) as never);
}

describe('offline pack', () => {
  let db: OfflineDb & { close(): void };
  const state: ServerState = {
    presets: [
      { id: 7, name: 'Push', exercises: [{ exercise_id: EXERCISE_A }] },
    ],
    exercises: [{ id: EXERCISE_A, name: 'Bench Press' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('saves workouts, exercises, last-time values, settings and who is signed in', async () => {
    serveFrom(state);

    expect(await isOfflinePackReady(db, 's1')).toBe(false);
    expect(await refreshOfflinePack()).toBe(true);

    const presets = await listCacheRows(
      db,
      's1',
      CACHE_COLLECTIONS.workoutPreset
    );
    expect(presets.map((row) => row.key)).toEqual(['7']);
    const exercises = await listCacheRows(db, 's1', CACHE_COLLECTIONS.exercise);
    expect(exercises.map((row) => row.key)).toEqual([EXERCISE_A]);
    // Once scoped to the saved workout, once on its own.
    for (const presetId of [7, undefined]) {
      expect(
        await getCacheRow(
          db,
          's1',
          CACHE_COLLECTIONS.exerciseStats,
          exerciseStatsCacheKey(EXERCISE_A, presetId)
        )
      ).not.toBeNull();
    }
    const preferences = await getCacheRow(
      db,
      's1',
      CACHE_COLLECTIONS.preferences,
      SINGLE_DOCUMENT_KEY
    );
    expect(preferences?.payload).toEqual({ default_weight_unit: 'lbs' });
    const identity = await getCacheRow(
      db,
      's1',
      IDENTITY_COLLECTION,
      IDENTITY_KEY
    );
    expect(identity?.payload).toEqual({ id: 'u1' });
    expect(await isOfflinePackReady(db, 's1')).toBe(true);
    // Two weeks of plan days, today first.
    const planDays = await listCacheRows(db, 's1', CACHE_COLLECTIONS.planDay);
    expect(planDays).toHaveLength(PLAN_DAYS_AHEAD);
    expect(planDays.map((row) => row.key)).toContain(getTodayDate());
  });

  it('removes a saved workout that was deleted on the server', async () => {
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.workoutPreset, [
      { key: '99', name: 'Gone', payload: {} },
    ]);
    serveFrom(state);

    await refreshOfflinePack({ force: true });

    const presets = await listCacheRows(
      db,
      's1',
      CACHE_COLLECTIONS.workoutPreset
    );
    expect(presets.map((row) => row.key)).toEqual(['7']);
  });

  it('does not run again inside six hours unless asked', async () => {
    serveFrom(state);
    await refreshOfflinePack();
    mockApiFetch.mockClear();

    expect(await refreshOfflinePack()).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();

    expect(await refreshOfflinePack({ force: true })).toBe(true);
  });

  it('runs again once the last refresh is older than six hours', async () => {
    serveFrom(state);
    await putCacheRows(
      db,
      's1',
      CACHE_COLLECTIONS.pack,
      [{ key: PACK_COMPLETED_KEY, payload: {} }],
      Date.now() - PACK_MAX_AGE_MS - 1
    );

    expect(await refreshOfflinePack()).toBe(true);
  });

  it('keeps what was saved when the server stops answering part-way', async () => {
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.exercise, [
      { key: 'kept', name: 'Kept', payload: {} },
    ]);
    serveFrom({ ...state, failOn: '/api/v2/exercises/search' });

    expect(await refreshOfflinePack({ force: true })).toBe(false);

    const exercises = await listCacheRows(db, 's1', CACHE_COLLECTIONS.exercise);
    expect(exercises.map((row) => row.key)).toEqual(['kept']);
    // Not marked complete, so a workout cannot be started offline on it.
    expect(await isOfflinePackReady(db, 's1')).toBe(false);
  });

  it('completes without last-time values against a server that lacks the batch route', async () => {
    serveFrom({ ...state, batchStatus: 404 });

    expect(await refreshOfflinePack({ force: true })).toBe(true);
    expect(await isOfflinePackReady(db, 's1')).toBe(true);
  });
});
