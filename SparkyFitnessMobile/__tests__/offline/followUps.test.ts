import Toast from 'react-native-toast-message';
import { apiFetch } from '../../src/services/api/apiClient';
import { ApiError } from '../../src/services/api/errors';
import { saveWorkoutSessionFeedback } from '../../src/services/api/workoutCoachingApi';
import { updateWorkoutPreset } from '../../src/services/api/workoutPresetsApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  WORKOUT_FEEDBACK_PUT,
  queuePresetUpdate,
  queueWorkoutFeedback,
  readQueuedFeedback,
} from '../../src/offline/followUps';
import { registerFollowUpHandlers } from '../../src/offline/handlers/followUps';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import {
  enqueueOutbox,
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import { drainOutbox } from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { WORKOUT_SESSION_CREATE } from '../../src/offline/workoutHandOver';
import { isSessionAwaitingServer } from '../../src/offline/sessionAwaitingServer';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));
jest.mock('../../src/services/api/workoutCoachingApi', () => ({
  saveWorkoutSessionFeedback: jest.fn(),
}));
jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  updateWorkoutPreset: jest.fn(),
}));
jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

const mockApiFetch = apiFetch as jest.Mock;
const mockSaveFeedback = saveWorkoutSessionFeedback as jest.Mock;
const mockUpdatePreset = updateWorkoutPreset as jest.Mock;

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const request = {
  session: { difficulty: 'hard' as const, pain: false, pain_note: null },
  exercises: [],
};

describe('feedback and saved-workout updates given offline', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    // Someone is signed in: work queued with no owner is refused.
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    __clearOutboxHandlersForTests();
    registerFollowUpHandlers();
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  const queueSession = () =>
    enqueueOutbox(db, {
      id: 'session-row',
      serverConfigId: 's1',
      userId: null,
      kind: WORKOUT_SESSION_CREATE,
      entityId: SESSION_ID,
      payload: {},
      payloadVersion: 1,
    });

  it('sends feedback only after its workout, and the last answer wins', async () => {
    await queueSession();
    expect(await isSessionAwaitingServer(SESSION_ID)).toBe(true);
    await queueWorkoutFeedback(SESSION_ID, request);
    const later = {
      ...request,
      session: { ...request.session, difficulty: 'easy' as const },
    };
    await queueWorkoutFeedback(SESSION_ID, later);

    const rows = await listUnconfirmedOutbox(db, 's1');
    const feedback = rows.filter((row) => row.kind === WORKOUT_FEEDBACK_PUT);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.dependsOn).toBe('session-row');
    expect(await readQueuedFeedback(SESSION_ID)).toEqual(later);

    // The workout row has no handler here, so it never uploads: nor does the feedback.
    await drainOutbox('manual');
    expect(mockSaveFeedback).not.toHaveBeenCalled();

    await updateOutboxRow(db, 'session-row', { status: 'synced', syncedAt: 1 });
    await drainOutbox('manual');
    expect(mockSaveFeedback).toHaveBeenCalledWith(SESSION_ID, later);
  });

  it('drops feedback for a workout that no longer exists', async () => {
    mockSaveFeedback.mockRejectedValue(new ApiError('gone', 404));
    await queueWorkoutFeedback(SESSION_ID, request);

    await drainOutbox('manual');

    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  const presetPayload = {
    presetId: 7,
    presetName: 'Push',
    exercises: [],
    expectedUpdatedAt: '2026-11-10T00:00:00.000Z',
  };

  it('updates the saved workout when it has not changed since', async () => {
    mockApiFetch.mockResolvedValue({
      id: 7,
      updated_at: '2026-11-10T00:00:00.000Z',
    });
    mockUpdatePreset.mockResolvedValue({});
    await queuePresetUpdate(presetPayload);

    await drainOutbox('manual');

    expect(mockUpdatePreset).toHaveBeenCalledWith(7, { exercises: [] });
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('skips the update and says so when the saved workout changed elsewhere', async () => {
    mockApiFetch.mockResolvedValue({
      id: 7,
      updated_at: '2026-11-15T00:00:00.000Z',
    });
    await queuePresetUpdate(presetPayload);

    await drainOutbox('manual');

    expect(mockUpdatePreset).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        text1: expect.stringContaining('was not updated'),
      })
    );
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('keeps the update waiting while the server cannot be reached', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));
    await queuePresetUpdate(presetPayload);

    await drainOutbox('manual');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row?.status).toBe('pending');
  });
});
