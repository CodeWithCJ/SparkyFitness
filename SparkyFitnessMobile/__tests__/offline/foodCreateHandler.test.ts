import { ApiError } from '../../src/services/api/errors';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { saveFood } from '../../src/services/api/foodsApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodCreateHandlers } from '../../src/offline/handlers/foodCreate';
import { listUnconfirmedOutbox } from '../../src/offline/outbox';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  findWaitingFood,
  isQueueableFoodCreate,
  listWaitingFoods,
  pendingFoodId,
  queueFoodCreate,
} from '../../src/offline/foodCreateHandOver';
import { previewFromQueuedRow } from '../../src/offline/foodEntryPreview';
import {
  readSavedFood,
  readSavedFoodsPage,
  readSavedFoodUsage,
  readSavedVariants,
} from '../../src/offline/foodLibrary';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
jest.mock('../../src/services/api/foodsApi', () => ({ saveFood: jest.fn() }));
const mockInvalidateQueries = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: {
    invalidateQueries: (...a: unknown[]) => mockInvalidateQueries(...a),
  },
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockSave = saveFood as jest.MockedFunction<typeof saveFood>;
const mockCreate = createFoodEntry as jest.MockedFunction<
  typeof createFoodEntry
>;

const FOOD_KEY = '11111111-1111-4111-8111-111111111111';
const ENTRY_KEY = '22222222-2222-4222-8222-222222222222';
const food = {
  name: 'Homemade bread',
  brand: null,
  serving_size: 50,
  serving_unit: 'g',
  calories: 130,
  protein: 4,
  carbs: 25,
  fat: 1,
};
const entry = {
  meal_type_id: 'meal-1',
  quantity: 2,
  unit: 'g',
  entry_date: '2026-11-21',
  entry_time: '08:30',
};
const savedFood = {
  id: 'food-9',
  default_variant: { id: 'variant-9', serving_size: 50, serving_unit: 'g' },
} as unknown as Awaited<ReturnType<typeof saveFood>>;

describe('new food upload handler', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodCreateHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => db.close());

  it('creates the food under its key, then logs the entry against it', async () => {
    await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
    mockSave.mockResolvedValue(savedFood);
    mockCreate.mockResolvedValue({ id: 'e1' } as never);

    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Homemade bread', client_id: FOOD_KEY })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-9',
        variant_id: 'variant-9',
        unit: 'g',
        quantity: 2,
        entry_date: '2026-11-21',
        client_id: ENTRY_KEY,
      })
    );
    expect(mockInvalidate).toHaveBeenCalledWith(
      expect.anything(),
      '2026-11-21'
    );
  });

  it('sends both keys again after a lost answer', async () => {
    await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
    mockSave.mockResolvedValue(savedFood);
    mockCreate.mockRejectedValueOnce(new ApiError('Bad gateway', 502));
    await drainOutbox('manual');
    mockCreate.mockResolvedValue({ id: 'e1' } as never);
    await drainOutbox('manual');

    expect(mockSave.mock.calls.map(([p]) => p.client_id)).toEqual([
      FOOD_KEY,
      FOOD_KEY,
    ]);
    expect(mockCreate.mock.calls.map(([p]) => p.client_id)).toEqual([
      ENTRY_KEY,
      ENTRY_KEY,
    ]);
  });

  it('keeps the row while the server is away', async () => {
    await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
    mockSave.mockRejectedValue(new TypeError('Network request failed'));

    expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 1 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('parks a food the server refuses', async () => {
    await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
    mockSave.mockRejectedValue(new ApiError('no', 400));

    await drainOutbox('manual');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('failed');
  });

  it('is shown in the diary as the entry it will become', async () => {
    await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
    const [row] = await listUnconfirmedOutbox(db, 's1');

    const preview = await previewFromQueuedRow(db, 's1', row);

    expect(preview).toMatchObject({
      id: `pending-${ENTRY_KEY}`,
      food_name: 'Homemade bread',
      calories: 130,
      serving_size: 50,
      serving_unit: 'g',
      quantity: 2,
      entry_date: '2026-11-21',
    });
  });

  it('only keeps a plain food', () => {
    const ok = { food, hasImages: false, hasExtraServings: false };
    expect(isQueueableFoodCreate(ok)).toBe(true);
    expect(isQueueableFoodCreate({ ...ok, hasImages: true })).toBe(false);
    expect(isQueueableFoodCreate({ ...ok, hasExtraServings: true })).toBe(
      false
    );
    expect(
      isQueueableFoodCreate({
        ...ok,
        food: { ...food, provider_type: 'openfoodfacts' },
      })
    ).toBe(false);
  });

  describe('a new food made for the library alone', () => {
    it('is created on upload, with no entry logged', async () => {
      await queueFoodCreate(FOOD_KEY, null, food, null);
      mockSave.mockResolvedValue(savedFood);

      expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: FOOD_KEY })
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('has no entry to show in the diary', async () => {
      await queueFoodCreate(FOOD_KEY, null, food, null);
      const [row] = await listUnconfirmedOutbox(db, 's1');

      expect(await previewFromQueuedRow(db, 's1', row)).toBeNull();
    });
  });

  describe('a food that is still waiting, read like any saved food', () => {
    beforeEach(async () => {
      await queueFoodCreate(FOOD_KEY, null, food, null);
    });

    it('is listed first in the search and the recents, and found by name', async () => {
      const page = await readSavedFoodsPage(db, 's1', '', 1, 20);
      expect(page?.foods.map((item) => item.id)).toEqual([
        pendingFoodId(FOOD_KEY),
      ]);
      expect(
        (await readSavedFoodsPage(db, 's1', 'bread', 1, 20))?.totalCount
      ).toBe(1);
      expect((await readSavedFoodsPage(db, 's1', 'zzz', 1, 20))?.foods).toEqual(
        []
      );
      expect(
        (await readSavedFoodUsage(db, 's1'))?.recentFoods.map((i) => i.name)
      ).toEqual(['Homemade bread']);
    });

    it('opens by its pending id with its one serving', async () => {
      const id = pendingFoodId(FOOD_KEY);

      expect((await readSavedFood(db, 's1', id))?.name).toBe('Homemade bread');
      const variants = await readSavedVariants(db, 's1', id);
      expect(variants).toHaveLength(1);
      expect(variants?.[0]).toMatchObject({
        serving_size: 50,
        serving_unit: 'g',
        calories: 130,
      });
    });

    it('is listed once however many entries wait with it, and not once uploaded', async () => {
      await queueFoodCreate(FOOD_KEY, ENTRY_KEY, food, entry);
      expect(await listWaitingFoods(db, 's1')).toHaveLength(1);
      expect(await findWaitingFood(FOOD_KEY)).not.toBeNull();

      mockSave.mockResolvedValue(savedFood);
      mockCreate.mockResolvedValue({ id: 'e1' } as never);
      await drainOutbox('manual');

      expect(await listWaitingFoods(db, 's1')).toEqual([]);
      expect(await findWaitingFood(FOOD_KEY)).toBeNull();
    });

    it('leaves out a quick food, which exists only for its entry', async () => {
      await queueFoodCreate(
        '33333333-3333-4333-8333-333333333333',
        ENTRY_KEY,
        { ...food, is_quick_food: true },
        entry
      );

      expect(await listWaitingFoods(db, 's1')).toHaveLength(1);
    });
  });
});
