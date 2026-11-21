import { apiFetch } from '../../src/services/api/apiClient';
import { putCacheRows, listCacheRows } from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../src/offline/collections';
import { refreshRecentDailySummaries } from '../../src/offline/dailySummaryCache';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { DIARY_DAYS_KEPT } from '../../src/offline/diaryDay';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { queueWaterDrink } from '../../src/offline/waterHandOver';
import {
  applyWaitingToRawData,
  buildDailySummary,
  loadDailySummaryRawData,
  type DailySummaryRawData,
} from '../../src/services/dailySummaryService';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));
jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  fetchFoodEntryMealsByDate: jest.fn(async () => {
    throw new TypeError('Network request failed');
  }),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const DAY = '2026-11-20';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';
const KEY_C = '33333333-3333-4333-8333-333333333333';

const serverSummary = {
  goals: { calories: 2000, protein: 100, carbs: 200, fat: 60 },
  foodEntries: [
    {
      id: 'e1',
      meal_type: 'Lunch',
      quantity: 1,
      unit: 'serving',
      entry_date: DAY,
      serving_size: 1,
      calories: 500,
      protein: 30,
    },
  ],
  exerciseSessions: [],
  waterIntake: 750,
  waterIntakeBreakdown: { food_ml: 0, manual_ml: 750 },
  calorieBalance: {
    eaten: 500,
    burned: 0,
    remaining: 1500,
    goal: 2000,
    net: 500,
    progress: 25,
    bmr: 1600,
    exerciseSource: 'none',
    tdeeProjection: null,
  },
};

const quickAdd = (calories: number, date = DAY) => ({
  meal_type_id: 'm1',
  quantity: 1,
  unit: 'serving',
  entry_date: date,
  food_name: 'Snack',
  calories,
  protein: 10,
});

describe("a day's totals with entries waiting to upload", () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.waterContainers, [
      {
        key: SINGLE_DOCUMENT_KEY,
        payload: [
          { id: 4, name: 'Glass', volume: 500, servings_per_container: 2 },
          {
            id: 5,
            name: 'Latte',
            volume: 0,
            servings_per_container: 1,
            linked_food_id: 'food-9',
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  describe('readWaitingForDay', () => {
    it('adds up the food and the millilitres of the drinks of that day', async () => {
      await queueFoodEntry(KEY_A, quickAdd(300));
      await queueWaterDrink(KEY_B, { entryDate: DAY, containerId: 4 });
      await queueWaterDrink(KEY_C, { entryDate: DAY, containerId: 4 });

      const waiting = await readWaitingForDay(DAY);

      expect(waiting.foodEntries.map((entry) => entry.calories)).toEqual([300]);
      expect(waiting.waterMl).toBe(500); // two presses of 250 ml
    });

    it('does not count a drink from a container linked to a food', async () => {
      await queueWaterDrink(KEY_A, { entryDate: DAY, containerId: 5 });

      expect((await readWaitingForDay(DAY)).waterMl).toBe(0);
    });

    it('leaves out other days and entries made under another account', async () => {
      await queueFoodEntry(KEY_A, quickAdd(100, '2026-11-19'));
      await db.run(
        `UPDATE outbox SET user_id = 'someone-else' WHERE entity_id = ?`,
        [KEY_A]
      );
      await queueFoodEntry(KEY_B, quickAdd(200));
      await db.run(
        `UPDATE outbox SET user_id = 'someone-else' WHERE entity_id = ?`,
        [KEY_B]
      );

      const waiting = await readWaitingForDay(DAY);

      expect(waiting.foodEntries).toEqual([]);
      expect(waiting.waterMl).toBe(0);
    });
  });

  describe('applyWaitingToRawData', () => {
    const raw = (): DailySummaryRawData => ({
      goals: serverSummary.goals as DailySummaryRawData['goals'],
      foodEntries:
        serverSummary.foodEntries as DailySummaryRawData['foodEntries'],
      exerciseEntries: [],
      waterIntake: { water_ml: 750 },
      waterIntakeBreakdown: { food_ml: 0, manual_ml: 750 } as never,
      stepCalories: 0,
      calorieBalance:
        serverSummary.calorieBalance as DailySummaryRawData['calorieBalance'],
    });

    it('returns the day unchanged when nothing is waiting', () => {
      const data = raw();
      expect(
        applyWaitingToRawData(data, {
          foodEntries: [],
          waterMl: 0,
          deletedFoodEntryIds: [],
          updatedQuantities: {},
        })
      ).toBe(data);
    });

    it('counts a waiting entry in the list, the calories and the macros', async () => {
      await queueFoodEntry(KEY_A, quickAdd(300));
      const waiting = await readWaitingForDay(DAY);

      const summary = buildDailySummary(
        DAY,
        applyWaitingToRawData(raw(), waiting)
      );

      expect(summary.foodEntries).toHaveLength(2);
      expect(summary.caloriesConsumed).toBe(800);
      expect(summary.protein.consumed).toBe(40);
      // The server's balance moves with it: 300 more eaten, 300 less left.
      expect(summary.calorieBalance).toMatchObject({
        eaten: 800,
        remaining: 1200,
        net: 800,
      });
    });

    it('adds the drinks to the water total', () => {
      const summary = buildDailySummary(
        DAY,
        applyWaitingToRawData(raw(), {
          foodEntries: [],
          waterMl: 250,
          deletedFoodEntryIds: [],
          updatedQuantities: {},
        })
      );

      expect(summary.waterConsumed).toBe(1000);
      expect(summary.waterManual).toBe(1000);
    });
  });

  describe('the day with the server away', () => {
    it('shows the last copy plus what is waiting, and the same once back online', async () => {
      // Opened while online: the copy is kept.
      mockApiFetch.mockResolvedValue(serverSummary as never);
      expect((await loadDailySummaryRawData(DAY)).foodEntries).toHaveLength(1);

      // Offline, with a quick-add and a drink waiting.
      await queueFoodEntry(KEY_A, quickAdd(300));
      await queueWaterDrink(KEY_B, { entryDate: DAY, containerId: 4 });
      mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));

      const offline = buildDailySummary(
        DAY,
        await loadDailySummaryRawData(DAY)
      );

      expect(offline.caloriesConsumed).toBe(800);
      expect(offline.waterConsumed).toBe(1000);
      expect(offline.calorieGoal).toBe(2000);
    });

    it('says nothing when the day was never kept', async () => {
      mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));

      await expect(loadDailySummaryRawData(DAY)).rejects.toBeInstanceOf(
        TypeError
      );
    });
  });

  describe('refreshRecentDailySummaries', () => {
    it('keeps the last week, one copy a day, and drops older days', async () => {
      await putCacheRows(db, 's1', CACHE_COLLECTIONS.dailySummary, [
        { key: '2026-11-01', payload: serverSummary },
      ]);
      mockApiFetch.mockResolvedValue(serverSummary as never);

      await refreshRecentDailySummaries(db, 's1', DAY);

      const keys = (
        await listCacheRows(db, 's1', CACHE_COLLECTIONS.dailySummary)
      ).map((row) => row.key);
      expect(keys).toHaveLength(DIARY_DAYS_KEPT);
      expect(keys).toContain(DAY);
      expect(keys).not.toContain('2026-11-01');
    });

    it('keeps the copies it has when the server stops answering', async () => {
      await putCacheRows(db, 's1', CACHE_COLLECTIONS.dailySummary, [
        { key: DAY, payload: serverSummary },
      ]);
      mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));

      await expect(
        refreshRecentDailySummaries(db, 's1', DAY)
      ).rejects.toBeInstanceOf(TypeError);

      expect(
        await listCacheRows(db, 's1', CACHE_COLLECTIONS.dailySummary)
      ).toHaveLength(1);
    });
  });
});
