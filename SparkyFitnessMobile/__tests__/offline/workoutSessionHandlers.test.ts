import type { PresetSessionResponse } from '@workspace/shared';
import { ApiError } from '../../src/services/api/errors';
import {
  createWorkout,
  deleteWorkout,
  getWorkout,
  updateWorkout,
} from '../../src/services/api/exerciseApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerWorkoutSessionHandlers } from '../../src/offline/handlers/workoutSession';
import { enqueueOutbox, getOutboxRow } from '../../src/offline/outbox';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_DELETE,
  WORKOUT_SESSION_UPDATE,
} from '../../src/offline/workoutHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/exerciseApi', () => ({
  createWorkout: jest.fn(),
  deleteWorkout: jest.fn(),
  getWorkout: jest.fn(),
  updateWorkout: jest.fn(),
}));
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

const mockCreate = createWorkout as jest.MockedFunction<typeof createWorkout>;
const mockUpdate = updateWorkout as jest.MockedFunction<typeof updateWorkout>;
const mockGet = getWorkout as jest.MockedFunction<typeof getWorkout>;
const mockDelete = deleteWorkout as jest.MockedFunction<typeof deleteWorkout>;

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const COMPLETED = '2026-11-16T10:00:00.000Z';

const sentExercises = [
  {
    id: 'entry-1',
    exercise_id: EXERCISE_ID,
    sort_order: 0,
    duration_minutes: 0,
    sets: [
      {
        set_number: 1,
        set_type: 'Working Set',
        reps: 5,
        weight: 100,
        completed_at: COMPLETED,
      },
    ],
  },
];

function serverSession(
  overrides: { reps?: number; revision?: number; finished?: boolean } = {}
): PresetSessionResponse {
  return {
    type: 'preset',
    id: SESSION_ID,
    entry_date: '2026-11-16',
    workout_preset_id: null,
    name: 'Push',
    description: null,
    notes: null,
    source: 'sparky',
    status: 'completed',
    finished_at: overrides.finished === false ? null : COMPLETED,
    revision: overrides.revision ?? 3,
    total_duration_minutes: 0,
    activity_details: [],
    exercises: [
      {
        id: 'entry-1',
        exercise_id: EXERCISE_ID,
        duration_minutes: 0,
        calories_burned: 0,
        entry_date: '2026-11-16',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: 'sparky',
        superset_group: null,
        exercise_snapshot: null,
        activity_details: [],
        sets: [
          {
            id: 9,
            set_number: 1,
            set_type: 'Working Set',
            reps: overrides.reps ?? 5,
            weight: 100,
            duration: null,
            rest_time: null,
            notes: null,
            rpe: null,
            completed_at: COMPLETED,
            is_pr: false,
          },
        ],
      },
    ],
  };
}

describe('workout session upload handlers', () => {
  let db: OfflineDb & { close(): void };

  const queue = (kind: string, payload: unknown, baseRevision?: number) =>
    enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind,
      entityId: SESSION_ID,
      entryDate: '2026-11-16',
      payload,
      payloadVersion: 1,
      baseRevision,
    });

  const createPayload = {
    id: SESSION_ID,
    name: 'Push',
    entry_date: '2026-11-16',
    source: 'sparky',
    exercises: sentExercises,
    finished_at: COMPLETED,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerWorkoutSessionHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('creates a workout logged offline, once', async () => {
    mockCreate.mockResolvedValue(serverSession());
    await queue(WORKOUT_SESSION_CREATE, createPayload);

    await drainOutbox('reconnect');

    expect(mockCreate).toHaveBeenCalledWith(createPayload);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });

  it('sends the newer sets when the server already held an older copy', async () => {
    // An earlier create reached the server with fewer reps logged.
    mockCreate.mockResolvedValue(serverSession({ reps: 3, finished: false }));
    mockUpdate.mockResolvedValue(serverSession());
    await queue(WORKOUT_SESSION_CREATE, createPayload);

    await drainOutbox('reconnect');

    expect(mockUpdate).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        exercises: sentExercises,
        finished_at: COMPLETED,
        revision: 3,
      })
    );
    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });

  it('creates without the saved-workout link when that saved workout was deleted', async () => {
    mockCreate
      .mockRejectedValueOnce(new ApiError('not found', 404))
      .mockResolvedValueOnce(serverSession());
    await queue(WORKOUT_SESSION_CREATE, {
      ...createPayload,
      workout_preset_id: 7,
    });

    await drainOutbox('reconnect');

    expect(mockCreate.mock.calls[1]![0]).not.toHaveProperty(
      'workout_preset_id'
    );
    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });

  it('keeps a create waiting while the server cannot be reached', async () => {
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));
    await queue(WORKOUT_SESSION_CREATE, createPayload);

    await drainOutbox('reconnect');

    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
  });

  it('updates a workout the server had, presenting the revision last seen', async () => {
    mockUpdate.mockResolvedValue(serverSession());
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect(mockUpdate).toHaveBeenCalledWith(SESSION_ID, {
      exercises: sentExercises,
      revision: 2,
    });
  });

  it("does not ask when the 'change elsewhere' was this phone's own save", async () => {
    mockUpdate
      .mockRejectedValueOnce(new ApiError('conflict', 409))
      .mockResolvedValueOnce(serverSession());
    mockGet.mockResolvedValue(serverSession({ revision: 5 }));
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect(mockUpdate.mock.calls[1]).toEqual([
      SESSION_ID,
      { exercises: sentExercises, revision: 5 },
    ]);
    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });

  it('stops for the person when only the name changed elsewhere and the sets match', async () => {
    mockUpdate.mockRejectedValue(new ApiError('conflict', 409));
    mockGet.mockResolvedValue({
      ...serverSession(),
      name: 'Renamed on the web',
    });
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { name: 'Push', exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'conflict',
      lastError: 'changed',
    });
  });

  it("still treats a matching name and sets as this phone's own save", async () => {
    mockUpdate
      .mockRejectedValueOnce(new ApiError('conflict', 409))
      .mockResolvedValueOnce(serverSession());
    mockGet.mockResolvedValue(serverSession({ revision: 5 }));
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { name: 'Push', exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });

  it('stops for the person when the workout really changed elsewhere', async () => {
    mockUpdate.mockRejectedValue(new ApiError('conflict', 409));
    mockGet.mockResolvedValue(serverSession({ reps: 8 }));
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'conflict',
      lastError: 'changed',
    });
  });

  it('stops for the person when the workout was deleted elsewhere', async () => {
    mockUpdate.mockRejectedValue(new ApiError('gone', 404));
    await queue(
      WORKOUT_SESSION_UPDATE,
      { body: { exercises: sentExercises } },
      2
    );

    await drainOutbox('reconnect');

    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'conflict',
      lastError: 'deleted',
    });
  });

  it('counts a removal of an already removed workout as done', async () => {
    mockDelete.mockRejectedValue(new ApiError('gone', 404));
    await queue(WORKOUT_SESSION_DELETE, { id: SESSION_ID });

    await drainOutbox('reconnect');

    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('synced');
  });
});
