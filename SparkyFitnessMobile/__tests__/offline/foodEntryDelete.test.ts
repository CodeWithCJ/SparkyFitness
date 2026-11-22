import { ApiError } from '../../src/services/api/errors';
import { deleteFoodEntry } from '../../src/services/api/foodEntriesApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { readOfflineDiaryDay } from '../../src/offline/diaryDay';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import {
  cancelWaitingEntry,
  queueFoodEntryDelete,
} from '../../src/offline/foodEntryDeleteHandOver';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryDeleteHandlers } from '../../src/offline/handlers/foodEntryDelete';
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
import { queueWaterDrink } from '../../src/offline/waterHandOver';
import {
  applyWaitingToRawData,
  buildDailySummary,
  type DailySummaryRawData,
} from '../../src/services/dailySummaryService';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  ...jest.requireActual('../../src/services/api/foodEntriesApi'),
  deleteFoodEntry: jest.fn(),
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockDelete = deleteFoodEntry as jest.MockedFunction<
  typeof deleteFoodEntry
>;

const DAY = '2026-11-21';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const quickAdd = {
  meal_type_id: 'm1',
  quantity: 1,
  unit: 'serving',
  entry_date: DAY,
  food_name: 'Snack',
  calories: 300,
};

describe('deleting a food entry with no connection', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryDeleteHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  describe('the upload', () => {
    it('removes the entry and refreshes the day', async () => {
      await queueFoodEntryDelete('entry-1', '2026-11-21T00:00:00.000Z');
      mockDelete.mockResolvedValue(undefined);

      expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

      expect(mockDelete).toHaveBeenCalledWith('entry-1', undefined);
      // The day is the calendar day, not the instant it came as.
      expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
    });

    it('counts an entry already gone as done', async () => {
      await queueFoodEntryDelete('entry-1', DAY);
      mockDelete.mockRejectedValue(new ApiError('gone', 404));

      expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    });

    it('keeps the removal while the server is away', async () => {
      await queueFoodEntryDelete('entry-1', DAY);
      mockDelete.mockRejectedValue(new TypeError('Network request failed'));

      expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 1 });
    });

    it('queues the same removal once', async () => {
      await queueFoodEntryDelete('entry-1', DAY);
      await queueFoodEntryDelete('entry-1', DAY);

      expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(1);
    });
  });

  describe('cancelWaitingEntry', () => {
    it('takes an entry that never reached the server out of the queue', async () => {
      await queueFoodEntry(KEY_A, quickAdd);

      expect(await cancelWaitingEntry(KEY_A)).toBe('cancelled');

      expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
      expect((await readOfflineDiaryDay(DAY)).waitingFood).toEqual([]);
    });

    it('takes a waiting drink out of the queue too', async () => {
      await queueWaterDrink(KEY_A, { entryDate: DAY, containerId: 4 });

      expect(await cancelWaitingEntry(KEY_A)).toBe('cancelled');
      expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
    });

    it('leaves an entry that is being sent this moment alone', async () => {
      await queueFoodEntry(KEY_A, quickAdd);
      const [row] = await listUnconfirmedOutbox(db, 's1');
      await updateOutboxRow(db, row.id, { status: 'sending' });

      expect(await cancelWaitingEntry(KEY_A)).toBe('uploading');

      expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(1);
    });

    it('says so when nothing waits under the key any more', async () => {
      expect(await cancelWaitingEntry(KEY_A)).toBe('gone');
    });
  });

  describe('in the day on the phone', () => {
    const raw = (): DailySummaryRawData => ({
      goals: { calories: 2000 } as DailySummaryRawData['goals'],
      foodEntries: [
        {
          id: 'entry-1',
          meal_type: 'Lunch',
          quantity: 1,
          unit: 'serving',
          entry_date: DAY,
          serving_size: 1,
          calories: 500,
        },
        {
          id: 'entry-2',
          meal_type: 'Lunch',
          quantity: 1,
          unit: 'serving',
          entry_date: DAY,
          serving_size: 1,
          calories: 200,
        },
      ],
      exerciseEntries: [],
      waterIntake: { water_ml: 0 },
      stepCalories: 0,
      calorieBalance: {
        eaten: 700,
        burned: 0,
        remaining: 1300,
        goal: 2000,
        net: 700,
        progress: 35,
        bmr: 1600,
        exerciseSource: 'none',
        tdeeProjection: null,
      },
    });

    it('hides the entry and gives its calories back', async () => {
      await queueFoodEntryDelete('entry-1', DAY);

      const waiting = await readWaitingForDay(DAY);
      const summary = buildDailySummary(
        DAY,
        applyWaitingToRawData(raw(), waiting)
      );

      expect(waiting.deletedFoodEntryIds).toEqual(['entry-1']);
      expect(summary.foodEntries.map((entry) => entry.id)).toEqual(['entry-2']);
      expect(summary.calorieBalance).toMatchObject({
        eaten: 200,
        remaining: 1800,
        net: 200,
      });
      expect(summary.protein.consumed).toBe(0);
    });

    it('lists the removal for the offline Diary', async () => {
      await queueFoodEntryDelete('entry-1', DAY);

      expect((await readOfflineDiaryDay(DAY)).deletedFood).toEqual(['entry-1']);
    });

    it('adds a waiting entry and removes another in the same day', async () => {
      await queueFoodEntry(KEY_A, quickAdd);
      await queueFoodEntryDelete('entry-2', DAY);

      const summary = buildDailySummary(
        DAY,
        applyWaitingToRawData(raw(), await readWaitingForDay(DAY))
      );

      // 700 - 200 removed + 300 waiting.
      expect(summary.calorieBalance.eaten).toBe(800);
      expect(summary.foodEntries).toHaveLength(2);
    });
  });
});
