import {
  SYNCED_RETENTION_MS,
  countUnconfirmedOutbox,
  deleteOldSyncedOutbox,
  deleteUnconfirmedForEntity,
  enqueueOutbox,
  getOutboxRow,
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import { createTestDb } from '../helpers/offlineTestDb';

const base = {
  serverConfigId: 's1',
  userId: 'u1',
  kind: 'workout_session.create',
  entityId: 'session-1',
  payloadVersion: 1,
};

describe('offline outbox', () => {
  it('queues work as pending and reads it back', async () => {
    const db = await createTestDb();
    await enqueueOutbox(
      db,
      { ...base, id: 'o1', payload: { sets: 2 }, entryDate: '2026-11-16' },
      1000
    );

    const row = await getOutboxRow(db, 'o1');
    expect(row).toMatchObject({
      id: 'o1',
      status: 'pending',
      attempts: 0,
      payload: { sets: 2 },
      entryDate: '2026-11-16',
      userId: 'u1',
      baseRevision: null,
      createdAt: 1000,
    });
    db.close();
  });

  it('keeps one unconfirmed row per entity and kind, replacing its payload', async () => {
    const db = await createTestDb();
    const first = await enqueueOutbox(
      db,
      { ...base, id: 'o1', payload: { sets: 2 } },
      1000
    );
    await updateOutboxRow(db, 'o1', { attempts: 3, lastError: 'offline' });
    const second = await enqueueOutbox(
      db,
      { ...base, id: 'o2', payload: { sets: 5 } },
      2000
    );

    expect(first).toBe('o1');
    expect(second).toBe('o1');
    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'o1',
      payload: { sets: 5 },
      attempts: 0,
      lastError: null,
      createdAt: 1000,
    });
    db.close();
  });

  it('starts a new row once the earlier one was confirmed', async () => {
    const db = await createTestDb();
    await enqueueOutbox(db, { ...base, id: 'o1', payload: {} }, 1000);
    await updateOutboxRow(db, 'o1', { status: 'synced', syncedAt: 1500 });
    const id = await enqueueOutbox(db, { ...base, id: 'o2', payload: {} });

    expect(id).toBe('o2');
    expect(await countUnconfirmedOutbox(db, 's1')).toBe(1);
    db.close();
  });

  it('keeps the base revision when a newer snapshot brings none', async () => {
    const db = await createTestDb();
    await enqueueOutbox(db, {
      ...base,
      id: 'o1',
      kind: 'workout_session.update',
      payload: {},
      baseRevision: 4,
    });
    await enqueueOutbox(db, {
      ...base,
      id: 'o2',
      kind: 'workout_session.update',
      payload: { later: true },
    });

    expect((await getOutboxRow(db, 'o1'))?.baseRevision).toBe(4);
    db.close();
  });

  it('lists only the active server, oldest first', async () => {
    const db = await createTestDb();
    await enqueueOutbox(
      db,
      { ...base, id: 'b', entityId: 'e2', payload: {} },
      2000
    );
    await enqueueOutbox(
      db,
      { ...base, id: 'a', entityId: 'e1', payload: {} },
      1000
    );
    await enqueueOutbox(db, {
      ...base,
      id: 'other',
      serverConfigId: 's2',
      payload: {},
    });

    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    db.close();
  });

  it('removes a discarded entity with the rows waiting on it', async () => {
    const db = await createTestDb();
    await enqueueOutbox(db, { ...base, id: 'session', payload: {} });
    await enqueueOutbox(db, {
      ...base,
      id: 'feedback',
      kind: 'workout_feedback.put',
      entityId: 'feedback-of-session-1',
      dependsOn: 'session',
      payload: {},
    });
    await enqueueOutbox(db, {
      ...base,
      id: 'unrelated',
      entityId: 'session-2',
      payload: {},
    });

    await deleteUnconfirmedForEntity(db, 's1', 'session-1');

    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((row) => row.id)).toEqual(['unrelated']);
    db.close();
  });

  it('drops only safety copies older than the retention window', async () => {
    const db = await createTestDb();
    const now = 10 * SYNCED_RETENTION_MS;
    await enqueueOutbox(db, {
      ...base,
      id: 'old',
      entityId: 'e1',
      payload: {},
    });
    await enqueueOutbox(db, {
      ...base,
      id: 'new',
      entityId: 'e2',
      payload: {},
    });
    await enqueueOutbox(
      db,
      { ...base, id: 'waiting', entityId: 'e3', payload: {} },
      1
    );
    await updateOutboxRow(db, 'old', {
      status: 'synced',
      syncedAt: now - SYNCED_RETENTION_MS - 1,
    });
    await updateOutboxRow(db, 'new', {
      status: 'synced',
      syncedAt: now - 1000,
    });

    const removed = await deleteOldSyncedOutbox(db, now);

    expect(removed).toBe(1);
    expect(await getOutboxRow(db, 'old')).toBeNull();
    expect(await getOutboxRow(db, 'new')).not.toBeNull();
    // Never confirmed, however old: kept.
    expect(await getOutboxRow(db, 'waiting')).not.toBeNull();
    db.close();
  });
});
