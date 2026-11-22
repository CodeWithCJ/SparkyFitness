import { putCacheRows } from '../../src/offline/cacheStore';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { readOfflineDiaryDay } from '../../src/offline/diaryDay';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import { enqueueOutbox, listUnconfirmedOutbox } from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  queueWaterDrink,
  removeLatestDrinkOffline,
  WATER_ADD,
} from '../../src/offline/waterHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));

const DAY = '2026-11-21';
const KEY = '11111111-1111-4111-8111-111111111111';
const drink = { entryDate: DAY, containerId: 1 };
const entry = {
  food_id: 'f1',
  variant_id: 'v1',
  meal_type_id: 'mt',
  quantity: 1,
  unit: 'serving',
  entry_date: DAY,
} as never;

describe('offline work belongs to the account that made it', () => {
  let db: OfflineDb & { close(): void };
  const signIn = (id: string) =>
    putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id } },
    ]);

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  it('refuses to queue a drink or an entry when nobody is known to be signed in', async () => {
    expect(await queueWaterDrink(KEY, drink)).toBe(false);
    expect(await queueFoodEntry(KEY, entry)).toBe(false);
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(0);
  });

  it('does not show another account the waiting totals or Diary rows', async () => {
    await signIn('alice');
    expect(await queueWaterDrink(KEY, drink)).toBe(true);
    expect(await queueFoodEntry(KEY.replace('1', '2'), entry)).toBe(true);
    // A row nobody owns, as an older build could have left.
    await enqueueOutbox(db, {
      id: 'orphan',
      serverConfigId: 's1',
      userId: null,
      kind: WATER_ADD,
      entityId: 'orphan-key',
      entryDate: DAY,
      payload: drink,
      payloadVersion: 1,
    });

    await signIn('bob');

    const totals = await readWaitingForDay(DAY);
    expect(totals.waterMl).toBe(0);
    expect(totals.foodEntries).toHaveLength(0);
    const diary = await readOfflineDiaryDay(DAY);
    expect(diary.waitingFood).toHaveLength(0);
  });

  it("does not let the water minus button cancel another account's waiting drink", async () => {
    await signIn('alice');
    await queueWaterDrink(KEY, drink);

    await signIn('bob');
    expect(await removeLatestDrinkOffline(DAY)).toBe('none');
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(1);

    await signIn('alice');
    expect(await removeLatestDrinkOffline(DAY)).toBe('cancelled');
  });
});
