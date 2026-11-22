import { apiFetch } from '../../src/services/api/apiClient';
import { listCacheRows, putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  DIARY_DAYS_KEPT,
  mergeWaitingFood,
  readOfflineDiaryDay,
  refreshRecentFoodDays,
  saveDiaryDayFood,
} from '../../src/offline/diaryDay';
import { queueFoodEntry } from '../../src/offline/foodEntryHandOver';
import { foodCacheRows } from '../../src/offline/foodLibrary';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FoodItem } from '../../src/types/foods';
import { calculateEntryNutrition } from '../../src/utils/mealNutrition';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const DAY = '2026-11-20';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';

const entry = (id: string, date: string, calories = 200): FoodEntry => ({
  id,
  meal_type: 'Lunch',
  quantity: 1,
  unit: 'serving',
  entry_date: date,
  serving_size: 1,
  calories,
});

const oats = {
  id: 'food-1',
  name: 'Oats',
  brand: 'Mill',
  is_custom: true,
  default_variant: {
    id: 'variant-1',
    serving_size: 40,
    serving_unit: 'g',
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
  },
} as FoodItem;

describe("the Diary day's food on the phone", () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
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

  it('keeps the entries of a diary load for that day', async () => {
    await saveDiaryDayFood(DAY, [entry('e1', DAY)]);

    const day = await readOfflineDiaryDay(DAY);
    expect(day.savedFood?.map((item) => item.id)).toEqual(['e1']);
    expect((await readOfflineDiaryDay('2026-11-19')).savedFood).toBeNull();
  });

  it('shows a waiting quick-add with its own nutrients', async () => {
    await queueFoodEntry(KEY_A, {
      meal_type_id: 'm1',
      quantity: 1,
      unit: 'serving',
      entry_date: DAY,
      food_name: 'Snack bar',
      calories: 250,
      protein: 10,
    });

    const [waiting] = (await readOfflineDiaryDay(DAY)).waitingFood;

    expect(waiting).toMatchObject({
      id: `pending-${KEY_A}`,
      food_name: 'Snack bar',
      calories: 250,
      protein: 10,
    });
    expect(calculateEntryNutrition(waiting).calories).toBe(250);
  });

  it('shows a waiting library food scaled to the amount logged', async () => {
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.food, foodCacheRows([oats]));
    await queueFoodEntry(KEY_A, {
      meal_type_id: 'm1',
      quantity: 80,
      unit: 'g',
      entry_date: DAY,
      food_id: 'food-1',
      variant_id: 'variant-1',
    });

    const [waiting] = (await readOfflineDiaryDay(DAY)).waitingFood;

    expect(waiting).toMatchObject({
      food_name: 'Oats',
      brand_name: 'Mill',
      serving_size: 40,
      serving_unit: 'g',
    });
    // 80 g of a 40 g serving of 150 kcal.
    expect(calculateEntryNutrition(waiting).calories).toBe(300);
  });

  it('leaves out a waiting food whose serving is not kept', async () => {
    await queueFoodEntry(KEY_A, {
      meal_type_id: 'm1',
      quantity: 1,
      unit: 'serving',
      entry_date: DAY,
      food_id: 'gone',
      variant_id: 'v-gone',
    });

    expect((await readOfflineDiaryDay(DAY)).waitingFood).toEqual([]);
  });

  it('lists only the waiting entries of that day and account', async () => {
    await queueFoodEntry(KEY_A, {
      meal_type_id: 'm1',
      quantity: 1,
      unit: 'serving',
      entry_date: DAY,
      food_name: 'Today',
      calories: 1,
    });
    await queueFoodEntry(KEY_B, {
      meal_type_id: 'm1',
      quantity: 1,
      unit: 'serving',
      entry_date: '2026-11-19',
      food_name: 'Yesterday',
      calories: 1,
    });

    const names = (await readOfflineDiaryDay(DAY)).waitingFood.map(
      (item) => item.food_name
    );
    expect(names).toEqual(['Today']);
  });

  it('puts the waiting entries after the saved ones', () => {
    const merged = mergeWaitingFood(
      [entry('a', DAY)],
      [entry('pending-b', DAY)]
    );
    expect(merged.map((item) => item.id)).toEqual(['a', 'pending-b']);
  });

  describe('refreshing the last week', () => {
    it('keeps each day under its own date, empty days included', async () => {
      mockApiFetch.mockResolvedValue([
        entry('e1', DAY),
        entry('e2', '2026-11-20T00:00:00.000Z'),
        entry('e3', '2026-11-18'),
      ]);

      await refreshRecentFoodDays(db, 's1', DAY);

      const rows = await listCacheRows(
        db,
        's1',
        CACHE_COLLECTIONS.diaryFoodDay
      );
      expect(rows).toHaveLength(DIARY_DAYS_KEPT);
      const byKey = Object.fromEntries(
        rows.map((row) => [row.key, (row.payload as FoodEntry[]).length])
      );
      expect(byKey[DAY]).toBe(2);
      expect(byKey['2026-11-18']).toBe(1);
      expect(byKey['2026-11-19']).toBe(0);
      expect(mockApiFetch.mock.calls[0][0].endpoint).toBe(
        '/api/food-entries/range/2026-11-14/2026-11-20'
      );
    });

    it('drops days older than the week', async () => {
      await putCacheRows(db, 's1', CACHE_COLLECTIONS.diaryFoodDay, [
        { key: '2026-11-01', payload: [entry('old', '2026-11-01')] },
      ]);
      mockApiFetch.mockResolvedValue([]);

      await refreshRecentFoodDays(db, 's1', DAY);

      const keys = (
        await listCacheRows(db, 's1', CACHE_COLLECTIONS.diaryFoodDay)
      ).map((row) => row.key);
      expect(keys).not.toContain('2026-11-01');
    });

    it('keeps what it had when the server cannot be reached', async () => {
      await saveDiaryDayFood(DAY, [entry('kept', DAY)]);
      mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));

      await expect(refreshRecentFoodDays(db, 's1', DAY)).rejects.toBeInstanceOf(
        TypeError
      );

      expect((await readOfflineDiaryDay(DAY)).savedFood).toHaveLength(1);
    });
  });
});
