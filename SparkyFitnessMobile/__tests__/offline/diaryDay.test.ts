import type {
  ExerciseSessionResponse,
  PresetSessionResponse,
} from '@workspace/shared';
import { beginAccountChange } from '../../src/offline/accountGeneration';
import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  mergeWaitingWorkouts,
  readOfflineDiaryDay,
  saveDiaryDayWorkouts,
} from '../../src/offline/diaryDay';
import { subscribeDiaryDaySaved } from '../../src/offline/events';
import { enqueueOutbox } from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
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

const DAY = '2026-11-16';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const COMPLETED = '2026-11-16T10:00:00.000Z';

const savedSession = (id: string, name: string): PresetSessionResponse => ({
  type: 'preset',
  id,
  entry_date: DAY,
  workout_preset_id: null,
  name,
  description: null,
  notes: null,
  source: 'sparky',
  status: 'completed',
  finished_at: COMPLETED,
  total_duration_minutes: 0,
  activity_details: [],
  exercises: [],
});

const createPayload = (id: string, finished: boolean) => ({
  id,
  name: 'Offline push',
  entry_date: DAY,
  source: 'sparky',
  ...(finished ? { finished_at: COMPLETED } : {}),
  exercises: [
    {
      exercise_id: EXERCISE_ID,
      sort_order: 0,
      duration_minutes: 0,
      sets: [
        {
          set_number: 1,
          reps: 5,
          weight: 100,
          completed_at: COMPLETED,
          is_pr: true,
        },
      ],
    },
  ],
});

describe('the diary day kept on the phone', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.exercise, [
      {
        key: EXERCISE_ID,
        name: 'Bench Press',
        payload: { id: EXERCISE_ID, name: 'Bench Press', category: null },
      },
    ]);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('has nothing for a day never loaded', async () => {
    expect(await readOfflineDiaryDay(DAY)).toEqual({
      saved: null,
      waiting: [],
      deleted: [],
    });
  });

  it('returns the workouts saved at the last diary load', async () => {
    await saveDiaryDayWorkouts(DAY, [savedSession('s-1', 'Legs')]);

    const day = await readOfflineDiaryDay(DAY);

    expect(day.saved?.map((session) => session.id)).toEqual(['s-1']);
  });

  it('replaces the saved day with a later load, including an empty one', async () => {
    await saveDiaryDayWorkouts(DAY, [
      savedSession('s-1', 'Legs'),
      savedSession('s-2', 'Push'),
    ]);
    await saveDiaryDayWorkouts(DAY, []);

    expect((await readOfflineDiaryDay(DAY)).saved).toEqual([]);
  });

  it('tells the offline view to read again after saving a day', async () => {
    const listener = jest.fn();
    const stop = subscribeDiaryDaySaved(listener);

    await saveDiaryDayWorkouts(DAY, [savedSession('s-1', 'Legs')]);
    stop();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not show the saved day while an account change cleared nothing or is still clearing', async () => {
    await saveDiaryDayWorkouts(DAY, [savedSession('s-1', 'Legs')]);

    // The clean-up failed: the saved day, and the identity that queued
    // workouts are matched to, may be the previous account's.
    await enqueueOutbox(db, {
      id: 'queued',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-queued',
      entryDate: DAY,
      payload: createPayload('w-queued', true),
      payloadVersion: 1,
    });
    await beginAccountChange(async () => false);
    expect(await readOfflineDiaryDay(DAY)).toEqual({
      saved: null,
      waiting: [],
      deleted: [],
    });

    // A later change that cleared it makes the saved copy readable again.
    await beginAccountChange(async () => true);
    expect(
      (await readOfflineDiaryDay(DAY)).saved?.map((session) => session.id)
    ).toEqual(['s-1']);
  });

  it('rebuilds a workout waiting to be created, with its logged sets and names', async () => {
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-1',
      entryDate: DAY,
      payload: createPayload('w-1', true),
      payloadVersion: 1,
    });

    const [waiting] = (await readOfflineDiaryDay(DAY)).waiting;

    expect(waiting?.id).toBe('w-1');
    expect(waiting?.name).toBe('Offline push');
    expect(waiting?.status).toBe('completed');
    expect(waiting?.exercises[0]?.exercise_snapshot?.name).toBe('Bench Press');
    expect(waiting?.exercises[0]?.sets[0]).toMatchObject({
      reps: 5,
      completed_at: COMPLETED,
      is_pr: true,
    });
  });

  it('shows an unfinished queued workout as in progress', async () => {
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-1',
      entryDate: DAY,
      payload: createPayload('w-1', false),
      payloadVersion: 1,
    });

    const [waiting] = (await readOfflineDiaryDay(DAY)).waiting;

    expect(waiting?.status).toBe('in_progress');
  });

  it('puts in the queued version of a workout the server had', async () => {
    await saveDiaryDayWorkouts(DAY, [savedSession('s-1', 'Legs')]);
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_UPDATE,
      entityId: 's-1',
      entryDate: DAY,
      payload: { body: { exercises: createPayload('s-1', true).exercises } },
      payloadVersion: 1,
      baseRevision: 2,
    });

    const [waiting] = (await readOfflineDiaryDay(DAY)).waiting;

    // The name it had is kept; the sets are the phone's.
    expect(waiting?.name).toBe('Legs');
    expect(waiting?.exercises).toHaveLength(1);
  });

  it('keeps the exercises of a workout whose waiting edit changes only its name', async () => {
    await saveDiaryDayWorkouts(DAY, [savedSession('s-1', 'Legs')]);
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_UPDATE,
      entityId: 's-1',
      entryDate: DAY,
      payload: { body: { name: 'Legs renamed' } },
      payloadVersion: 1,
      baseRevision: 2,
    });

    const { waiting } = await readOfflineDiaryDay(DAY);

    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.name).toBe('Legs renamed');
    expect(waiting[0]?.exercises).toHaveLength(
      savedSession('s-1', 'Legs').exercises.length
    );
  });

  it('shows a resumed workout once, with the sets of its latest upload', async () => {
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-1',
      entryDate: DAY,
      payload: createPayload('w-1', true),
      payloadVersion: 1,
    });
    await enqueueOutbox(db, {
      id: 'row-2',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_UPDATE,
      entityId: 'w-1',
      entryDate: DAY,
      payload: {
        body: {
          exercises: [
            ...createPayload('w-1', true).exercises,
            ...createPayload('w-1', true).exercises,
          ],
        },
      },
      payloadVersion: 1,
    });

    const { waiting } = await readOfflineDiaryDay(DAY);

    expect(waiting.map((session) => session.id)).toEqual(['w-1']);
    expect(waiting[0]?.name).toBe('Offline push');
    expect(waiting[0]?.exercises).toHaveLength(2);
  });

  it("leaves out another account's waiting workouts and other days'", async () => {
    await enqueueOutbox(db, {
      id: 'other-account',
      serverConfigId: 's1',
      userId: 'u2',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-2',
      entryDate: DAY,
      payload: createPayload('w-2', true),
      payloadVersion: 1,
    });
    await enqueueOutbox(db, {
      id: 'other-day',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_CREATE,
      entityId: 'w-3',
      entryDate: '2026-11-15',
      payload: { ...createPayload('w-3', true), entry_date: '2026-11-15' },
      payloadVersion: 1,
    });

    expect((await readOfflineDiaryDay(DAY)).waiting).toEqual([]);
  });

  it('merges waiting workouts into a day: replacing their old copy, adding new ones', () => {
    const sessions: ExerciseSessionResponse[] = [
      savedSession('a', 'Old A'),
      savedSession('b', 'B'),
    ];
    const merged = mergeWaitingWorkouts(sessions, [
      savedSession('a', 'New A'),
      savedSession('c', 'C'),
    ]);

    expect(
      merged.map((session) => (session as PresetSessionResponse).name)
    ).toEqual(['New A', 'B', 'C']);
  });

  it('hides a workout whose removal is waiting to upload', async () => {
    await enqueueOutbox(db, {
      id: 'row-del',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_DELETE,
      entityId: 'b',
      entryDate: DAY,
      payload: { id: 'b' },
      payloadVersion: 1,
    });

    const day = await readOfflineDiaryDay(DAY);
    expect(day.deleted).toEqual(['b']);

    const merged = mergeWaitingWorkouts(
      [savedSession('a', 'A'), savedSession('b', 'B')],
      [],
      day.deleted
    );
    expect(merged.map((session) => session.id)).toEqual(['a']);
  });
});
