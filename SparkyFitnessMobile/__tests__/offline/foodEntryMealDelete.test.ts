import { ApiError } from '../../src/services/api/errors';
import { deleteFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { mergeWaitingFood } from '../../src/offline/diaryDay';
import { queueFoodEntryMealDelete } from '../../src/offline/foodEntryMealDeleteHandOver';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryMealDeleteHandlers } from '../../src/offline/handlers/foodEntryMealDelete';
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
jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  deleteFoodEntryMeal: jest.fn(),
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

const mockDelete = deleteFoodEntryMeal as jest.MockedFunction<
  typeof deleteFoodEntryMeal
>;
const DAY = '2026-11-21';
const component = (id: string, mealId?: string, calories = 100) => ({
  id,
  meal_type: 'Lunch',
  quantity: 1,
  unit: 'serving',
  entry_date: DAY,
  serving_size: 1,
  calories,
  ...(mealId ? { food_entry_meal_id: mealId } : {}),
});

describe('deleting a logged meal with no connection', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryMealDeleteHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('uploads the removal and refreshes the day', async () => {
    await queueFoodEntryMealDelete('fem-1', DAY);
    mockDelete.mockResolvedValue(undefined);

    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockDelete).toHaveBeenCalledWith('fem-1', undefined);
    expect(mockInvalidate).toHaveBeenCalledWith({}, DAY);
    expect(mockInvalidateMeals).toHaveBeenCalled();
  });

  it('counts a meal already gone as done and keeps one while the server is away', async () => {
    await queueFoodEntryMealDelete('fem-1', DAY);
    mockDelete.mockRejectedValue(new ApiError('gone', 404));
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

    await queueFoodEntryMealDelete('fem-2', DAY);
    mockDelete.mockRejectedValue(new TypeError('Network request failed'));
    expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 1 });
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(1);
  });

  it('takes every component of the meal out of the day and its totals', async () => {
    await queueFoodEntryMealDelete('fem-1', DAY);
    const waiting = await readWaitingForDay(DAY);
    expect(waiting.deletedMealIds).toEqual(['fem-1']);

    const entries = [
      component('c1', 'fem-1', 200),
      component('c2', 'fem-1', 300),
      component('other', undefined, 100),
    ];
    const raw = {
      foodEntries: entries,
      waterIntake: { water_ml: 0 },
      waterIntakeBreakdown: null,
      calorieBalance: { eaten: 600, net: 600, remaining: 1400 },
    } as unknown as DailySummaryRawData;
    const applied = applyWaitingToRawData(raw, waiting);

    expect(applied.foodEntries.map((entry) => entry.id)).toEqual(['other']);
    expect(applied.calorieBalance?.eaten).toBe(100);
    expect(applied.calorieBalance?.remaining).toBe(1900);

    expect(
      mergeWaitingFood(
        entries as never,
        [],
        [],
        {},
        waiting.deletedMealIds
      ).map((entry) => entry.id)
    ).toEqual(['other']);
  });
});
