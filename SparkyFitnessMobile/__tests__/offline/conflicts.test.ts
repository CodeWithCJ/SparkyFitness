import { resolveWorkoutConflict } from '../../src/offline/conflicts';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import {
  enqueueOutbox,
  getOutboxRow,
  updateOutboxRow,
} from '../../src/offline/outbox';
import type { OfflineDb } from '../../src/offline/types';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_UPDATE,
} from '../../src/offline/workoutHandOver';
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

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('resolving a workout changed elsewhere', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    // No handlers: the choice is recorded, nothing is actually sent here.
    __clearOutboxHandlersForTests();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: WORKOUT_SESSION_UPDATE,
      entityId: SESSION_ID,
      entryDate: '2026-11-16',
      payload: {
        body: {
          name: 'Push',
          finished_at: '2026-11-16T11:00:00.000Z',
          exercises: [
            {
              id: 'entry-1',
              exercise_id: '11111111-1111-4111-8111-111111111111',
              workout_plan_assignment_id: 4,
              sort_order: 0,
              duration_minutes: 0,
              sets: [{ id: 9, set_number: 1, reps: 5, weight: 100 }],
            },
          ],
        },
      },
      payloadVersion: 1,
      baseRevision: 3,
    });
    await updateOutboxRow(db, 'row-1', {
      status: 'conflict',
      lastError: 'changed',
    });
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  const resolve = (choice: Parameters<typeof resolveWorkoutConflict>[1]) =>
    resolveWorkoutConflict('row-1', choice, { phoneSuffix: '(phone)' });

  it("keeps this phone's copy by sending it without the revision guard", async () => {
    await resolve('keepPhone');

    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'pending',
      kind: WORKOUT_SESSION_UPDATE,
      baseRevision: null,
    });
  });

  it("keeps the server's copy by sending nothing", async () => {
    await resolve('keepServer');

    const row = await getOutboxRow(db, 'row-1');
    expect(row?.status).toBe('synced');
    expect(row?.syncedAt).not.toBeNull();
  });

  it('keeps both by uploading the phone copy as a new workout', async () => {
    await resolve('saveSeparately');

    const row = await getOutboxRow(db, 'row-1');
    expect(row).toMatchObject({
      status: 'pending',
      kind: WORKOUT_SESSION_CREATE,
    });
    const payload = row?.payload as {
      id: string;
      name: string;
      finished_at: string;
      exercises: {
        id?: string;
        workout_plan_assignment_id?: number;
        sets: { id?: number }[];
      }[];
    };
    expect(payload.id).not.toBe(SESSION_ID);
    expect(row?.entityId).toBe(payload.id);
    expect(payload.name).toBe('Push (phone)');
    expect(payload.finished_at).toBe('2026-11-16T11:00:00.000Z');
    // New records throughout: nothing points at the server's workout or plan.
    expect(payload.exercises[0]).not.toHaveProperty('id');
    expect(payload.exercises[0]).not.toHaveProperty(
      'workout_plan_assignment_id'
    );
    expect(payload.exercises[0]!.sets[0]).not.toHaveProperty('id');
  });

  it('does not make an empty workout from an edit that holds no exercises', async () => {
    await updateOutboxRow(db, 'row-1', {
      payload: { body: { name: 'Renamed' } },
    });

    await resolve('saveSeparately');

    expect(await getOutboxRow(db, 'row-1')).toMatchObject({
      status: 'conflict',
      kind: WORKOUT_SESSION_UPDATE,
    });
  });

  it('ignores a row that is no longer in conflict', async () => {
    await updateOutboxRow(db, 'row-1', { status: 'pending' });

    await resolve('keepServer');

    expect((await getOutboxRow(db, 'row-1'))?.status).toBe('pending');
  });
});
