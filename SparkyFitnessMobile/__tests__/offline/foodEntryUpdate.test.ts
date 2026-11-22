import { ApiError } from '../../src/services/api/errors';
import { updateFoodEntry } from '../../src/services/api/foodEntriesApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { queueFoodEntryDelete } from '../../src/offline/foodEntryDeleteHandOver';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  mergeWaitingFood,
  readOfflineDiaryDay,
} from '../../src/offline/diaryDay';
import { queueFoodCreate } from '../../src/offline/foodCreateHandOver';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import {
  editWaitingEntryQuantity,
  queueFoodEntryUpdate,
  upgradeFoodEntryUpdate,
} from '../../src/offline/foodEntryUpdateHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryUpdateHandlers } from '../../src/offline/handlers/foodEntryUpdate';
import {
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  applyWaitingToRawData,
  type DailySummaryRawData,
} from '../../src/services/dailySummaryService';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  ...jest.requireActual('../../src/services/api/foodEntriesApi'),
  updateFoodEntry: jest.fn(),
  createFoodEntry: jest.fn(),
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockUpdate = updateFoodEntry as jest.MockedFunction<
  typeof updateFoodEntry
>;

const DAY = '2026-11-21';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';
const serverEntry = {
  id: 'e1',
  meal_type: 'Lunch',
  quantity: 1,
  unit: 'serving',
  entry_date: DAY,
  serving_size: 1,
  calories: 500,
};

describe('changing the amount of an entry with no connection', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryUpdateHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('keeps one row per entry, holding the latest amount', async () => {
    await queueFoodEntryUpdate('e1', DAY, { quantity: 2 }, { quantity: 2 });
    await queueFoodEntryUpdate('e1', DAY, { quantity: 3 }, { quantity: 3 });

    const rows = await listUnconfirmedOutbox(db, 's1');

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({
      patch: { quantity: 3 },
      display: { quantity: 3 },
    });
  });

  it('uploads the amount and refreshes the day', async () => {
    await queueFoodEntryUpdate('e1', DAY, { quantity: 3 }, { quantity: 3 });
    mockUpdate.mockResolvedValue({ id: 'e1' } as never);

    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockUpdate).toHaveBeenCalledWith('e1', { quantity: 3 });
    expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
  });

  it('counts an entry deleted meanwhile as done and parks a refusal', async () => {
    await queueFoodEntryUpdate('e1', DAY, { quantity: 3 }, { quantity: 3 });
    mockUpdate.mockRejectedValue(new ApiError('gone', 404));
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

    await queueFoodEntryUpdate('e2', DAY, { quantity: 3 }, { quantity: 3 });
    mockUpdate.mockRejectedValue(new ApiError('no', 403));
    await drainOutbox('manual');
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('failed');
  });

  it('shows the new amount in the totals and the offline list', async () => {
    await queueFoodEntryUpdate('e1', DAY, { quantity: 3 }, { quantity: 3 });

    const waiting = await readWaitingForDay(DAY);
    expect(waiting.changedEntries).toEqual({ e1: { quantity: 3 } });

    const raw = {
      foodEntries: [serverEntry],
      waterIntake: { water_ml: 0 },
      waterIntakeBreakdown: null,
      calorieBalance: {
        eaten: 500,
        net: 500,
        remaining: 1500,
      },
    } as unknown as DailySummaryRawData;
    const applied = applyWaitingToRawData(raw, waiting);
    expect(applied.foodEntries[0].quantity).toBe(3);
    // 500 kcal per serving, three servings: 1000 more than... 1500 in all.
    expect(applied.calorieBalance?.eaten).toBe(1500);
    expect(applied.calorieBalance?.remaining).toBe(500);

    expect(
      mergeWaitingFood(
        [serverEntry as never],
        [],
        [],
        waiting.changedEntries
      )[0].quantity
    ).toBe(3);
  });

  it('keeps every changed field, folding a later change into the same row', async () => {
    await queueFoodEntryUpdate(
      'e1',
      DAY,
      { quantity: 2, entry_time: '09:00' },
      { quantity: 2, entry_time: '09:00' }
    );
    await queueFoodEntryUpdate(
      'e1',
      DAY,
      { quantity: 3, notes: 'with honey' },
      { quantity: 3, notes: 'with honey' }
    );

    const rows = await listUnconfirmedOutbox(db, 's1');

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({
      patch: { quantity: 3, entry_time: '09:00', notes: 'with honey' },
      display: { quantity: 3, entry_time: '09:00', notes: 'with honey' },
    });
  });

  it('reads a change from before the other fields were kept', () => {
    expect(upgradeFoodEntryUpdate({ quantity: 4 }, 1)).toEqual({
      patch: { quantity: 4 },
      display: { quantity: 4 },
    });
  });

  describe('moving an entry to another day', () => {
    const NEXT = '2026-11-22';

    beforeEach(async () => {
      // The day the entry is on, as kept at the last diary load.
      await putCacheRows(db, 's1', CACHE_COLLECTIONS.diaryFoodDay, [
        { key: DAY, payload: [serverEntry] },
      ]);
      await queueFoodEntryUpdate(
        'e1',
        DAY,
        { entry_date: NEXT, meal_type_id: 'm2' },
        { entry_date: NEXT, meal_type_id: 'm2', meal_type: 'Dinner' }
      );
    });

    it('takes it off the day it was on', async () => {
      const waiting = await readWaitingForDay(DAY);

      expect(waiting.deletedFoodEntryIds).toEqual(['e1']);
      expect((await readOfflineDiaryDay(DAY)).deletedFood).toEqual(['e1']);
    });

    it('brings it onto the new day as it will read, with its calories', async () => {
      const waiting = await readWaitingForDay(NEXT);
      expect(waiting.foodEntries).toHaveLength(1);
      expect(waiting.foodEntries[0]).toMatchObject({
        id: 'e1',
        meal_type: 'Dinner',
        entry_date: NEXT,
        calories: 500,
      });

      const day = await readOfflineDiaryDay(NEXT);
      expect(day.waitingFood.map((entry) => entry.id)).toEqual(['e1']);
    });

    it('does not bring it in once it is deleted, and sends the whole change', async () => {
      await queueFoodEntryDelete('e1', NEXT);
      expect((await readWaitingForDay(NEXT)).foodEntries).toEqual([]);

      mockUpdate.mockResolvedValue({ id: 'e1' } as never);
      await drainOutbox('manual');
      expect(mockUpdate).toHaveBeenCalledWith('e1', {
        entry_date: NEXT,
        meal_type_id: 'm2',
      });
    });
  });

  describe('an entry still waiting to upload', () => {
    it('is refused once an upload was tried: the server may already hold the first amount', async () => {
      await queueFoodEntry(KEY_A, {
        meal_type_id: 'm1',
        quantity: 1,
        unit: 'serving',
        entry_date: DAY,
        food_name: 'Snack',
        calories: 300,
      });
      const [row] = await listUnconfirmedOutbox(db, 's1');
      await updateOutboxRow(db, row!.id, { attempts: 1 });

      expect(await editWaitingEntryQuantity(KEY_A, 4)).toBe('uploading');
      expect((await listUnconfirmedOutbox(db, 's1'))[0]!.payload).toMatchObject(
        {
          quantity: 1,
        }
      );
    });

    it('is rewritten in place, so only the final amount is sent', async () => {
      await queueFoodEntry(KEY_A, {
        meal_type_id: 'm1',
        quantity: 1,
        unit: 'serving',
        entry_date: DAY,
        food_name: 'Snack',
        calories: 300,
        cooked_quantity: 90,
      });

      expect(await editWaitingEntryQuantity(KEY_A, 4)).toBe('edited');

      const rows = await listUnconfirmedOutbox(db, 's1');
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({
        quantity: 4,
        cooked_quantity: null,
      });
    });

    it('works on a new food waiting with its entry', async () => {
      await queueFoodCreate(
        KEY_B,
        KEY_A,
        {
          name: 'Bread',
          brand: null,
          serving_size: 50,
          serving_unit: 'g',
          calories: 130,
          protein: 4,
          carbs: 25,
          fat: 1,
        },
        { meal_type_id: 'm1', quantity: 2, unit: 'g', entry_date: DAY }
      );

      expect(await editWaitingEntryQuantity(KEY_A, 5)).toBe('edited');

      const [row] = await listUnconfirmedOutbox(db, 's1');
      expect(
        (row.payload as { entry: { quantity: number } }).entry.quantity
      ).toBe(5);
    });

    it('is left alone while it is uploading, and reports one that is gone', async () => {
      await queueFoodEntry(KEY_A, {
        meal_type_id: 'm1',
        quantity: 1,
        unit: 'serving',
        entry_date: DAY,
        food_name: 'Snack',
        calories: 300,
      });
      await db.run(`UPDATE outbox SET status = 'sending' WHERE entity_id = ?`, [
        KEY_A,
      ]);

      expect(await editWaitingEntryQuantity(KEY_A, 4)).toBe('uploading');
      expect(await editWaitingEntryQuantity(KEY_B, 4)).toBe('gone');
    });
  });
});
