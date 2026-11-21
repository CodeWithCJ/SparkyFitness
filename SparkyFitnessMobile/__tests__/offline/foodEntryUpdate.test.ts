import { ApiError } from '../../src/services/api/errors';
import { updateFoodEntry } from '../../src/services/api/foodEntriesApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { mergeWaitingFood } from '../../src/offline/diaryDay';
import { queueFoodCreate } from '../../src/offline/foodCreateHandOver';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import {
  editWaitingEntryQuantity,
  queueFoodEntryQuantity,
} from '../../src/offline/foodEntryUpdateHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryUpdateHandlers } from '../../src/offline/handlers/foodEntryUpdate';
import { listUnconfirmedOutbox } from '../../src/offline/outbox';
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
    await queueFoodEntryQuantity('e1', DAY, 2);
    await queueFoodEntryQuantity('e1', DAY, 3);

    const rows = await listUnconfirmedOutbox(db, 's1');

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ quantity: 3 });
  });

  it('uploads the amount and refreshes the day', async () => {
    await queueFoodEntryQuantity('e1', DAY, 3);
    mockUpdate.mockResolvedValue({ id: 'e1' } as never);

    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockUpdate).toHaveBeenCalledWith('e1', { quantity: 3 });
    expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
  });

  it('counts an entry deleted meanwhile as done and parks a refusal', async () => {
    await queueFoodEntryQuantity('e1', DAY, 3);
    mockUpdate.mockRejectedValue(new ApiError('gone', 404));
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

    await queueFoodEntryQuantity('e2', DAY, 3);
    mockUpdate.mockRejectedValue(new ApiError('no', 403));
    await drainOutbox('manual');
    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('failed');
  });

  it('shows the new amount in the totals and the offline list', async () => {
    await queueFoodEntryQuantity('e1', DAY, 3);

    const waiting = await readWaitingForDay(DAY);
    expect(waiting.updatedQuantities).toEqual({ e1: 3 });

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
        waiting.updatedQuantities
      )[0].quantity
    ).toBe(3);
  });

  describe('an entry still waiting to upload', () => {
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
