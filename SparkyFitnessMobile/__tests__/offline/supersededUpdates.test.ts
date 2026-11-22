import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { discardOwnerlessUpload } from '../../src/offline/discardOwnerless';
import { FOOD_ENTRY_DELETE } from '../../src/offline/foodEntryDeleteHandOver';
import { dropSupersededMealUpdate } from '../../src/offline/foodEntryMealUpdateHandOver';
import {
  FOOD_ENTRY_UPDATE,
  dropSupersededUpdate,
  queueFoodEntryUpdate,
} from '../../src/offline/foodEntryUpdateHandOver';
import {
  deleteUnconfirmedUnlessSending,
  enqueueOutbox,
  getOutboxRow,
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

const ENTRY = 'entry-1';
const DAY = '2026-11-21';

describe('a direct save and the older changes still waiting on the phone', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('removes only the update it supersedes, never a delete queued for the same entry', async () => {
    await queueFoodEntryUpdate(ENTRY, DAY, { quantity: 2 }, { quantity: 2 });
    await enqueueOutbox(db, {
      id: 'del',
      serverConfigId: 's1',
      userId: 'u1',
      kind: FOOD_ENTRY_DELETE,
      entityId: ENTRY,
      entryDate: DAY,
      payload: {},
      payloadVersion: 1,
    });

    await dropSupersededUpdate(ENTRY, { quantity: 3 }, Date.now() + 1000);

    const rows = await listUnconfirmedOutbox(db, 's1');
    expect(rows.map((row) => row.kind)).toEqual([FOOD_ENTRY_DELETE]);
  });

  it('keeps the fields the save did not set', async () => {
    await queueFoodEntryUpdate(
      ENTRY,
      DAY,
      { quantity: 2, notes: 'x' },
      { quantity: 2, notes: 'x' }
    );

    await dropSupersededUpdate(ENTRY, { quantity: 3 }, Date.now() + 1000);

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row?.kind).toBe(FOOD_ENTRY_UPDATE);
    expect((row?.payload as { patch: object }).patch).toEqual({ notes: 'x' });
  });

  it('leaves a change queued after the save was sent: it is the newer one', async () => {
    const requestStartedAt = Date.now() - 1000;
    await queueFoodEntryUpdate(ENTRY, DAY, { quantity: 5 }, { quantity: 5 });

    await dropSupersededUpdate(ENTRY, { quantity: 3 }, requestStartedAt);

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect((row?.payload as { patch: object }).patch).toEqual({ quantity: 5 });
  });

  it('drops an older waiting meal change after an online save, but not a newer one', async () => {
    await enqueueOutbox(db, {
      id: 'meal-old',
      serverConfigId: 's1',
      userId: 'u1',
      kind: 'food_entry_meal.update',
      entityId: 'meal-1',
      entryDate: DAY,
      payload: { patch: {}, display: {} },
      payloadVersion: 1,
    });
    await dropSupersededMealUpdate('meal-1', Date.now() + 1000);
    expect(await getOutboxRow(db, 'meal-old')).toBeNull();

    await enqueueOutbox(db, {
      id: 'meal-new',
      serverConfigId: 's1',
      userId: 'u1',
      kind: 'food_entry_meal.update',
      entityId: 'meal-1',
      entryDate: DAY,
      payload: { patch: {}, display: {} },
      payloadVersion: 1,
    });
    await dropSupersededMealUpdate('meal-1', Date.now() - 1000);
    expect(await getOutboxRow(db, 'meal-new')).not.toBeNull();
  });

  it('discards a parked upload with no account, and only that one', async () => {
    await enqueueOutbox(db, {
      id: 'orphan',
      serverConfigId: 's1',
      userId: null,
      kind: FOOD_ENTRY_DELETE,
      entityId: 'a',
      payload: {},
      payloadVersion: 1,
    });
    await enqueueOutbox(db, {
      id: 'owned',
      serverConfigId: 's1',
      userId: 'u1',
      kind: FOOD_ENTRY_DELETE,
      entityId: 'b',
      payload: {},
      payloadVersion: 1,
    });

    expect(await discardOwnerlessUpload('owned')).toBe(false);
    expect(await discardOwnerlessUpload('orphan')).toBe(true);

    expect(await getOutboxRow(db, 'orphan')).toBeNull();
    expect(await getOutboxRow(db, 'owned')).not.toBeNull();
  });

  it('deletes a waiting row only if, as it is inside the transaction, it is neither being sent nor already tried', async () => {
    const queue = (id: string, entityId: string) =>
      enqueueOutbox(db, {
        id,
        serverConfigId: 's1',
        userId: 'u1',
        kind: FOOD_ENTRY_DELETE,
        entityId,
        payload: {},
        payloadVersion: 1,
      });
    const tried = (row: { attempts: number }) => row.attempts > 0;
    await queue('fresh', 'e-fresh');
    await queue('retried', 'e-retried');
    await updateOutboxRow(db, 'retried', { attempts: 2 });
    await queue('claimed', 'e-claimed');
    await updateOutboxRow(db, 'claimed', { status: 'sending' });

    expect(
      await deleteUnconfirmedUnlessSending(
        db,
        's1',
        'e-retried',
        undefined,
        tried
      )
    ).toBe('uploading');
    expect(
      await deleteUnconfirmedUnlessSending(
        db,
        's1',
        'e-claimed',
        undefined,
        tried
      )
    ).toBe('uploading');
    expect(
      await deleteUnconfirmedUnlessSending(
        db,
        's1',
        'e-fresh',
        undefined,
        tried
      )
    ).toBe('deleted');

    expect(await getOutboxRow(db, 'retried')).not.toBeNull();
    expect(await getOutboxRow(db, 'claimed')).not.toBeNull();
    expect(await getOutboxRow(db, 'fresh')).toBeNull();
  });
});
