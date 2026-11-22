import { ApiError } from '../../src/services/api/errors';
import { createFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { readOfflineDiaryDay } from '../../src/offline/diaryDay';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import {
  isQueueableFoodEntryMeal,
  queueFoodEntryMeal,
} from '../../src/offline/foodEntryMealHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryMealHandlers } from '../../src/offline/handlers/foodEntryMeal';
import { listUnconfirmedOutbox } from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
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
jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  createFoodEntryMeal: jest.fn(),
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockCreate = createFoodEntryMeal as jest.MockedFunction<
  typeof createFoodEntryMeal
>;

const DAY = '2026-11-21';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';
const meal = {
  meal_template_id: 'meal-1',
  meal_type: 'Lunch',
  meal_type_id: 'mt-1',
  entry_date: DAY,
  name: 'Porridge',
  quantity: 2,
  unit: 'serving',
};
// A meal of 4 servings: 200 g of oats at 400 kcal per 100 g.
const porridge = {
  id: 'meal-1',
  name: 'Porridge',
  serving_size: 1,
  serving_unit: 'serving',
  total_servings: 4,
  foods: [
    {
      id: 'i1',
      food_name: 'Oats',
      brand: null,
      quantity: 200,
      unit: 'g',
      serving_size: 100,
      serving_unit: 'g',
      calories: 400,
      protein: 12,
      carbs: 60,
      fat: 8,
    },
  ],
};

describe('logged meals waiting to upload', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryMealHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  describe('the upload', () => {
    it('sends each meal once with its own key and refreshes the day', async () => {
      await queueFoodEntryMeal(KEY_A, meal);
      await queueFoodEntryMeal(KEY_B, { ...meal, quantity: 1 });
      mockCreate.mockResolvedValue({ id: 'm' } as never);

      expect(await drainOutbox('manual')).toEqual({ synced: 2, remaining: 0 });

      const sent = mockCreate.mock.calls.map(([payload]) => payload);
      expect(sent.map((payload) => payload.client_id).sort()).toEqual([
        KEY_A,
        KEY_B,
      ]);
      for (const payload of sent) {
        expect(payload).toMatchObject({
          meal_template_id: 'meal-1',
          entry_date: DAY,
        });
      }
      expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
    });

    it('keeps the meal and stops the run while the server is away', async () => {
      await queueFoodEntryMeal(KEY_A, meal);
      await queueFoodEntryMeal(KEY_B, meal);
      mockCreate.mockRejectedValue(new TypeError('Network request failed'));

      expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 2 });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('sends the same key again after a lost answer', async () => {
      await queueFoodEntryMeal(KEY_A, meal);
      mockCreate.mockRejectedValueOnce(new ApiError('Bad gateway', 502));
      await drainOutbox('manual');
      mockCreate.mockResolvedValue({ id: 'm' } as never);
      await drainOutbox('manual');

      expect(mockCreate.mock.calls.map(([p]) => p.client_id)).toEqual([
        KEY_A,
        KEY_A,
      ]);
    });

    it.each([400, 404])(
      'parks a meal the server answers %i for',
      async (code) => {
        await queueFoodEntryMeal(KEY_A, meal);
        mockCreate.mockRejectedValue(new ApiError('no', code));

        await drainOutbox('manual');

        const [row] = await listUnconfirmedOutbox(db, 's1');
        expect(row.status).toBe('failed');
        expect(row.lastError).toContain(String(code));
      }
    );
  });

  describe('isQueueableFoodEntryMeal', () => {
    it('accepts a saved meal, with or without ingredients the server has', () => {
      expect(isQueueableFoodEntryMeal(meal)).toBe(true);
      expect(
        isQueueableFoodEntryMeal({
          ...meal,
          foods: [{ food_id: 'f', variant_id: 'v', quantity: 1, unit: 'g' }],
        })
      ).toBe(true);
    });

    it('refuses a meal made up on the spot or with an ingredient still to be created', () => {
      expect(
        isQueueableFoodEntryMeal({ ...meal, meal_template_id: null })
      ).toBe(false);
      expect(
        isQueueableFoodEntryMeal({
          ...meal,
          foods: [{ food_name: 'New', quantity: 1, unit: 'g' }],
        })
      ).toBe(false);
    });
  });

  describe('in the day on the phone', () => {
    beforeEach(async () => {
      await putCacheRows(db, 's1', CACHE_COLLECTIONS.meal, [
        { key: 'meal-1', name: 'Porridge', payload: porridge },
      ]);
    });

    it('shows one entry for the meal, scaled to the servings logged', async () => {
      await queueFoodEntryMeal(KEY_A, meal);

      const [waiting] = (await readOfflineDiaryDay(DAY)).waitingFood;

      // 200 g at 400 kcal per 100 g is 800 kcal over 4 servings: 200 each, 2 logged.
      expect(waiting).toMatchObject({
        id: `pending-${KEY_A}`,
        food_name: 'Porridge',
      });
      expect(calculateEntryNutrition(waiting)).toMatchObject({
        calories: 400,
        protein: 12,
      });
    });

    it("counts it in the day's totals", async () => {
      await queueFoodEntryMeal(KEY_A, meal);

      const waiting = await readWaitingForDay(DAY);

      expect(waiting.foodEntries).toHaveLength(1);
    });

    it('leaves out a meal the phone cannot work out, which still uploads', async () => {
      await queueFoodEntryMeal(KEY_A, { ...meal, unit: 'g', quantity: 150 });
      await queueFoodEntryMeal(KEY_B, { ...meal, meal_template_id: 'gone' });

      expect((await readOfflineDiaryDay(DAY)).waitingFood).toEqual([]);
      expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(2);
    });
  });
});
