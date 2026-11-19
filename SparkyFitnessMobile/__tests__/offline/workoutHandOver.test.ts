import type { PresetSessionResponse } from '@workspace/shared';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  enqueueOutbox,
  getOutboxRow,
  listUnconfirmedOutbox,
} from '../../src/offline/outbox';
import type { OfflineDb } from '../../src/offline/types';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_DELETE,
  WORKOUT_SESSION_UPDATE,
  uploadsToShow,
  queueActiveWorkoutForUpload,
  queueWorkoutCreate,
  queueWorkoutUpdate,
  queueWorkoutSessionDelete,
} from '../../src/offline/workoutHandOver';
import { isSessionAwaitingServer } from '../../src/offline/sessionAwaitingServer';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function session(): PresetSessionResponse {
  return {
    type: 'preset',
    id: SESSION_ID,
    entry_date: '2026-11-16',
    workout_preset_id: null,
    name: 'Push',
    description: null,
    notes: null,
    source: 'sparky',
    status: 'in_progress',
    revision: 6,
    total_duration_minutes: 0,
    activity_details: [],
    exercises: [
      {
        id: 'entry-1',
        exercise_id: '11111111-1111-4111-8111-111111111111',
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
            id: -1,
            set_number: 1,
            set_type: 'Working Set',
            reps: 5,
            weight: 100,
            duration: null,
            rest_time: null,
            notes: null,
            rpe: null,
            completed_at: null,
            is_pr: false,
          },
        ],
      },
    ],
  };
}

describe('handing the live workout to the upload queue', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    __resetActiveWorkoutStoreForTests();
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('queues a workout the server never had as a create with its id and finish time', async () => {
    useActiveWorkoutStore.getState().startWorkout(session(), {
      pendingCreate: {
        entryDate: '2026-11-16',
        workoutPresetId: 7,
        workoutPlanAssignmentId: null,
      },
    });

    const rowId = await queueActiveWorkoutForUpload({
      finishedAt: '2026-11-16T11:00:00.000Z',
    });

    const row = await getOutboxRow(db, rowId!);
    expect(row).toMatchObject({
      kind: WORKOUT_SESSION_CREATE,
      entityId: SESSION_ID,
      entryDate: '2026-11-16',
      baseRevision: null,
    });
    expect(row?.payload).toMatchObject({
      id: SESSION_ID,
      workout_preset_id: 7,
      finished_at: '2026-11-16T11:00:00.000Z',
    });
    expect(await isSessionAwaitingServer(SESSION_ID)).toBe(true);
  });

  it('queues a workout the server had as an update guarded by the revision last seen', async () => {
    useActiveWorkoutStore.getState().startWorkout(session());

    const rowId = await queueActiveWorkoutForUpload({ finishedAt: null });

    const row = await getOutboxRow(db, rowId!);
    expect(row).toMatchObject({
      kind: WORKOUT_SESSION_UPDATE,
      baseRevision: 6,
    });
    expect(row?.payload).not.toHaveProperty('body.finished_at');
    expect(await isSessionAwaitingServer(SESSION_ID)).toBe(false);
  });

  it('queues nothing when there is no live workout', async () => {
    expect(await queueActiveWorkoutForUpload({ finishedAt: null })).toBeNull();
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('replaces anything queued for a discarded workout with its removal', async () => {
    await enqueueOutbox(db, {
      id: 'create',
      serverConfigId: 's1',
      userId: null,
      kind: WORKOUT_SESSION_CREATE,
      entityId: SESSION_ID,
      payload: {},
      payloadVersion: 1,
    });

    expect(await queueWorkoutSessionDelete(SESSION_ID)).toBe(true);

    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((row) => row.kind)).toEqual([WORKOUT_SESSION_DELETE]);
  });
});

describe('saving a past workout or an edit while the server is away', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  const exercises = [
    {
      exercise_id: '11111111-1111-4111-8111-111111111111',
      sets: [{ set_number: 1, reps: 5, weight: 100 }],
    },
  ];

  it('queues a workout logged after the fact as a create with its own id', async () => {
    const queued = await queueWorkoutCreate({
      name: 'Workout - Nov 16',
      entry_date: '2026-11-16',
      source: 'sparky',
      finished_at: '2026-11-17T20:00:00.000Z',
      exercises,
    } as never);

    expect(queued).toBe(true);
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row).toMatchObject({
      kind: WORKOUT_SESSION_CREATE,
      entryDate: '2026-11-16',
      baseRevision: null,
    });
    expect((row?.payload as { id?: string }).id).toBe(row?.entityId);
    expect(row?.entityId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('queues an edit with the revision seen, and merges a second edit into it', async () => {
    await queueWorkoutUpdate(
      SESSION_ID,
      { name: 'Renamed', exercises } as never,
      6,
      '2026-11-16'
    );
    await queueWorkoutUpdate(
      SESSION_ID,
      { notes: 'felt good' } as never,
      6,
      '2026-11-16'
    );

    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: WORKOUT_SESSION_UPDATE,
      entityId: SESSION_ID,
      baseRevision: 6,
    });
    expect(
      (rows[0]?.payload as { body: Record<string, unknown> }).body
    ).toMatchObject({ name: 'Renamed', notes: 'felt good' });
  });
});

describe('uploadsToShow', () => {
  const row = (kind: string, entityId: string) => ({ kind, entityId });

  it('lists a resumed workout once, by its create', () => {
    const rows = [
      row(WORKOUT_SESSION_CREATE, 'w-1'),
      row(WORKOUT_SESSION_UPDATE, 'w-1'),
    ];

    expect(uploadsToShow(rows)).toEqual([row(WORKOUT_SESSION_CREATE, 'w-1')]);
  });

  it('keeps an update for a workout the server already has', () => {
    const rows = [
      row(WORKOUT_SESSION_UPDATE, 'w-1'),
      row(WORKOUT_SESSION_CREATE, 'w-2'),
    ];

    expect(uploadsToShow(rows)).toEqual(rows);
  });
});
