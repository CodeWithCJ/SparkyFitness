import { ApiError } from '../../src/services/api/errors';
import { updateFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import { getCacheRow, putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  mergeWaitingFood,
  readOfflineDiaryDay,
} from '../../src/offline/diaryDay';
import { queueFoodEntryMealDelete } from '../../src/offline/foodEntryMealDeleteHandOver';
import {
  mealEntryFromChange,
  queueFoodEntryMealUpdate,
} from '../../src/offline/foodEntryMealUpdateHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryMealUpdateHandlers } from '../../src/offline/handlers/foodEntryMealUpdate';
import {
  readSavedLoggedMeal,
  refreshLoggedMeals,
} from '../../src/offline/loggedMeals';
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
import { apiFetch } from '../../src/services/api/apiClient';
import type { FoodEntryMeal } from '../../src/types/foodEntryMeals';
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
  ...jest.requireActual('../../src/services/api/foodEntryMealsApi'),
  updateFoodEntryMeal: jest.fn(),
}));
const mockInvalidate = jest.fn();
const mockInvalidateMeals = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));
jest.mock('../../src/hooks/useMeals', () => ({
  invalidateMealUsageCaches: (...args: unknown[]) =>
    mockInvalidateMeals(...args),
}));

const mockUpdate = updateFoodEntryMeal as jest.MockedFunction<
  typeof updateFoodEntryMeal
>;
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const DAY = '2026-11-21';
const NEXT = '2026-11-22';
const component = (id: string, calories: number, mealId?: string) => ({
  id,
  meal_type: 'Lunch',
  quantity: 1,
  unit: 'serving',
  entry_date: DAY,
  serving_size: 1,
  calories,
  ...(mealId ? { food_entry_meal_id: mealId } : {}),
});
const meal = {
  id: 'fem-1',
  user_id: 'u1',
  meal_template_id: null,
  meal_type: 'Lunch',
  meal_type_id: 'm1',
  entry_date: DAY,
  name: 'Porridge',
  description: null,
  notes: null,
  quantity: 1,
  unit: 'serving',
  calories: 400,
  foods: [
    {
      food_id: 'f1',
      food_name: 'Oats',
      variant_id: 'v1',
      quantity: 1,
      unit: 'serving',
      serving_size: 1,
      serving_unit: 'serving',
      calories: 400,
    },
  ],
} as unknown as FoodEntryMeal;
const patch = {
  name: 'Big porridge',
  meal_type: 'Dinner',
  meal_type_id: 'm2',
  entry_date: DAY,
  quantity: 2,
  unit: 'serving',
  foods: [
    {
      food_id: 'f1',
      food_name: 'Oats',
      variant_id: 'v1',
      quantity: 2,
      unit: 'serving',
      serving_size: 1,
      serving_unit: 'serving',
      calories: 400,
    },
  ],
};
const display = {
  food_name: 'Big porridge',
  meal_type: 'Dinner',
  meal_type_id: 'm2',
  quantity: 2,
  unit: 'serving',
  entry_date: DAY,
  calories: 800,
  protein: 20,
};

describe('editing a logged meal with no connection', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryMealUpdateHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.loggedMeal, [
      { key: 'fem-1', name: 'Porridge', payload: meal },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.diaryFoodDay, [
      {
        key: DAY,
        payload: [component('c1', 250, 'fem-1'), component('c2', 150, 'fem-1')],
      },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('keeps one row per meal, the latest save replacing the earlier one', async () => {
    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);
    await queueFoodEntryMealUpdate(
      'fem-1',
      NEXT,
      { ...patch, quantity: 3 },
      { ...display, quantity: 3 }
    );

    const rows = await listUnconfirmedOutbox(db, 's1');

    expect(rows).toHaveLength(1);
    expect(
      (rows[0].payload as { patch: { quantity: number } }).patch.quantity
    ).toBe(3);
    // It stays on the day the meal was on.
    expect(rows[0].entryDate).toBe(DAY);
  });

  it('uploads the whole meal and refreshes the days, counting a deleted meal as done', async () => {
    await queueFoodEntryMealUpdate(
      'fem-1',
      DAY,
      { ...patch, entry_date: NEXT },
      display
    );
    mockUpdate.mockResolvedValue({} as never);

    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockUpdate).toHaveBeenCalledWith(
      'fem-1',
      expect.objectContaining({ name: 'Big porridge', quantity: 2 })
    );
    expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
    expect(mockInvalidate).toHaveBeenCalledWith({}, NEXT);
    expect(mockInvalidateMeals).toHaveBeenCalled();

    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);
    mockUpdate.mockRejectedValue(new ApiError('gone', 404));
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
  });

  it('keeps it while the server is away and parks a refusal', async () => {
    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);
    mockUpdate.mockRejectedValue(new TypeError('Network request failed'));
    expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 1 });

    mockUpdate.mockRejectedValue(new ApiError('no', 400));
    await drainOutbox('manual');
    expect((await listUnconfirmedOutbox(db, 's1'))[0].status).toBe('failed');
  });

  it('shows the meal as one entry in place of its components, in the totals and the list', async () => {
    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);

    const waiting = await readWaitingForDay(DAY);
    expect(waiting.deletedMealIds).toEqual(['fem-1']);
    expect(waiting.foodEntries).toHaveLength(1);
    expect(waiting.foodEntries[0]).toMatchObject({
      id: 'fem-1',
      food_entry_meal_id: 'fem-1',
      food_name: 'Big porridge',
      meal_type: 'Dinner',
      quantity: 2,
      serving_size: 2,
      calories: 800,
    });

    const raw = {
      foodEntries: [
        component('c1', 250, 'fem-1'),
        component('c2', 150, 'fem-1'),
        component('other', 100),
      ],
      waterIntake: { water_ml: 0 },
      waterIntakeBreakdown: null,
      calorieBalance: { eaten: 500, net: 500, remaining: 1500 },
    } as unknown as DailySummaryRawData;
    const applied = applyWaitingToRawData(raw, waiting);
    expect(applied.foodEntries.map((entry) => entry.id).sort()).toEqual([
      'fem-1',
      'other',
    ]);
    // 500 eaten, less the two components (400), plus the meal as saved (800).
    expect(applied.calorieBalance?.eaten).toBe(900);

    const day = await readOfflineDiaryDay(DAY);
    expect(day.deletedFoodMeals).toEqual(['fem-1']);
    expect(day.waitingFood.map((entry) => entry.id)).toEqual(['fem-1']);
    const list = mergeWaitingFood(
      [component('c1', 250, 'fem-1'), component('c2', 150, 'fem-1')] as never,
      day.waitingFood,
      day.deletedFood,
      day.updatedFood,
      day.deletedFoodMeals
    );
    expect(list.map((entry) => entry.id)).toEqual(['fem-1']);
  });

  it('moves the meal to another day: off the first, onto the new one', async () => {
    await queueFoodEntryMealUpdate(
      'fem-1',
      DAY,
      { ...patch, entry_date: NEXT },
      { ...display, entry_date: NEXT }
    );

    const first = await readWaitingForDay(DAY);
    expect(first.deletedMealIds).toEqual(['fem-1']);
    expect(first.foodEntries).toEqual([]);

    const next = await readWaitingForDay(NEXT);
    expect(next.foodEntries).toHaveLength(1);
    expect(next.foodEntries[0]).toMatchObject({
      id: 'fem-1',
      entry_date: NEXT,
    });
  });

  it('does not show a meal that is deleted after being changed', async () => {
    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);
    await queueFoodEntryMealDelete('fem-1', DAY);

    expect((await readWaitingForDay(DAY)).foodEntries).toEqual([]);
  });

  it('opens the meal again as saved last, with the waiting change applied', async () => {
    expect((await readSavedLoggedMeal(db, 's1', 'fem-1'))?.name).toBe(
      'Porridge'
    );

    await queueFoodEntryMealUpdate('fem-1', DAY, patch, display);
    const reopened = await readSavedLoggedMeal(db, 's1', 'fem-1');

    expect(reopened).toMatchObject({
      name: 'Big porridge',
      meal_type: 'Dinner',
      quantity: 2,
      calories: 800,
    });
    expect(reopened?.foods[0]).toMatchObject({
      food_name: 'Oats',
      quantity: 2,
    });
    expect(await readSavedLoggedMeal(db, 's1', 'nope')).toBeNull();
  });

  it('builds the entry the Diary shows from a saved change', () => {
    expect(
      mealEntryFromChange('fem-9', { quantity: 3, calories: 90 })
    ).toMatchObject({
      id: 'fem-9',
      food_entry_meal_id: 'fem-9',
      quantity: 3,
      serving_size: 3,
      calories: 90,
    });
  });

  it('keeps the meals of the kept days with their components, dropping the rest', async () => {
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.loggedMeal, [
      { key: 'old-meal', name: 'Old', payload: { id: 'old-meal' } },
    ]);
    mockApiFetch.mockImplementation(async ({ endpoint }) => {
      if (String(endpoint).endsWith('/fem-2')) throw new TypeError('offline');
      return { ...meal, id: 'fem-1', name: 'Fresh' } as never;
    });

    // The failing meal is reported once the others have had their turn, so the
    // pack does not record a complete refresh with a meal missing.
    await expect(
      refreshLoggedMeals(db, 's1', [
        component('c1', 1, 'fem-1'),
        component('c2', 1, 'fem-1'),
        component('c3', 1, 'fem-2'),
      ] as never)
    ).rejects.toThrow('offline');

    const kept = await getCacheRow(
      db,
      's1',
      CACHE_COLLECTIONS.loggedMeal,
      'fem-1'
    );
    expect((kept?.payload as { name: string }).name).toBe('Fresh');
    expect(
      await getCacheRow(db, 's1', CACHE_COLLECTIONS.loggedMeal, 'old-meal')
    ).toBeNull();
    // Called once per meal, and a meal that fails keeps what it had.
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});
