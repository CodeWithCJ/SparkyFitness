import {
  accountGeneration,
  bumpAccountGeneration,
} from '../../src/offline/accountGeneration';
import { apiFetch } from '../../src/services/api/apiClient';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  FOOD_LIBRARY_MAX,
  FOOD_VARIANTS_KEPT,
  chooseFoodsToKeep,
  readSavedFoodsPage,
  readSavedVariants,
  refreshFoodLibrary,
} from '../../src/offline/foodLibrary';
import { listCacheRows } from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../src/offline/collections';
import type { OfflineDb } from '../../src/offline/types';
import {
  fetchFoodsPage,
  fetchFoodVariants,
} from '../../src/services/api/foodsApi';
import { fetchMealTypes } from '../../src/services/api/mealTypesApi';
import { lookupBarcodeV2 } from '../../src/services/api/externalFoodSearchApi';
import {
  fetchMeal,
  fetchMeals,
  searchMeals,
} from '../../src/services/api/mealsApi';
import type { FoodItem } from '../../src/types/foods';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const food = (id: string, name: string, brand: string | null = null) =>
  ({
    id,
    name,
    brand,
    is_custom: true,
    default_variant: {
      id: `v-${id}`,
      serving_size: 100,
      serving_unit: 'g',
      calories: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
    },
  }) as FoodItem;

describe('chooseFoodsToKeep', () => {
  it('keeps recent, then most used, then own foods, each once', () => {
    const chosen = chooseFoodsToKeep(
      {
        recentFoods: [food('b', 'Bread'), food('a', 'Apple')],
        topFoods: [{ ...food('a', 'Apple'), usage_count: 9 }],
      },
      [food('a', 'Apple'), food('c', 'Cheese')]
    );
    expect(chosen.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('stops at the limit, so a huge library is not downloaded whole', () => {
    const own = Array.from({ length: 50 }, (_, i) =>
      food(`f${i}`, `Food ${i}`)
    );
    const chosen = chooseFoodsToKeep(
      { recentFoods: [], topFoods: [] },
      own,
      10
    );
    expect(chosen).toHaveLength(10);
    expect(FOOD_LIBRARY_MAX).toBeGreaterThan(10);
  });

  it('leaves out a food with no serving to log', () => {
    const noServing = { ...food('x', 'Broken'), default_variant: undefined };
    const chosen = chooseFoodsToKeep(
      { recentFoods: [noServing as unknown as FoodItem], topFoods: [] },
      []
    );
    expect(chosen).toEqual([]);
  });
});

describe('the food library on the phone', () => {
  let db: OfflineDb & { close(): void };
  let variantCalls: string[];

  /** A server holding `own` foods; recents are the first of them. */
  function serve(own: FoodItem[], failOn?: string) {
    variantCalls = [];
    mockApiFetch.mockImplementation((async ({
      endpoint,
    }: {
      endpoint: string;
    }) => {
      if (failOn && endpoint.startsWith(failOn)) {
        throw new TypeError('Network request failed');
      }
      if (endpoint === '/api/foods') {
        return { recentFoods: own.slice(0, 2), topFoods: [] };
      }
      if (endpoint === '/api/meals') {
        return [
          { id: 'meal-1', name: 'Porridge', foods: [] },
          { id: 'meal-2', name: 'Stew', foods: [] },
        ];
      }
      if (endpoint === '/api/water-containers') {
        return [
          { id: 4, name: 'Glass', volume: 500, servings_per_container: 2 },
        ];
      }
      if (endpoint === '/api/meal-types') {
        return [
          { id: 'm1', name: 'Breakfast', sort_order: 1, is_visible: true },
        ];
      }
      if (endpoint.startsWith('/api/foods/foods-paginated')) {
        const params = new URLSearchParams(endpoint.split('?')[1]);
        const page = Number(params.get('currentPage'));
        const size = Number(params.get('itemsPerPage'));
        return {
          foods: own.slice((page - 1) * size, page * size),
          totalCount: own.length,
        };
      }
      if (endpoint.startsWith('/api/foods/food-variants')) {
        variantCalls.push(endpoint);
        return [{ id: 'v1', serving_size: 1, serving_unit: 'cup' }];
      }
      throw new Error(`unexpected ${endpoint}`);
    }) as never);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });
  afterEach(() => db.close());

  it('keeps the foods, recents, meal types and some servings', async () => {
    const own = [
      food('a', 'Apple', 'Orchard'),
      food('b', 'Bread'),
      food('c', 'Cheese'),
    ];
    serve(own);

    await refreshFoodLibrary(db, 's1');

    expect(
      (await listCacheRows(db, 's1', CACHE_COLLECTIONS.food)).map((r) => r.key)
    ).toEqual(['b', 'c', 'a']); // listed by "brand name": Orchard Apple is last
    expect(
      await listCacheRows(db, 's1', CACHE_COLLECTIONS.foodRecents)
    ).toHaveLength(1);
    expect(
      (await listCacheRows(db, 's1', CACHE_COLLECTIONS.mealTypes))[0].key
    ).toBe(SINGLE_DOCUMENT_KEY);
    expect(variantCalls).toHaveLength(3);
    // The saved meals are kept too, by name, for logging a meal offline.
    expect(
      (await listCacheRows(db, 's1', CACHE_COLLECTIONS.meal)).map((r) => r.key)
    ).toEqual(['meal-1', 'meal-2']);
    // The water containers are kept too, for the drinks logged offline.
    expect(
      (await listCacheRows(db, 's1', CACHE_COLLECTIONS.waterContainers))[0].key
    ).toBe(SINGLE_DOCUMENT_KEY);
  });

  it('asks for the servings of only the first foods in a big library', async () => {
    serve(Array.from({ length: 160 }, (_, i) => food(`f${i}`, `Food ${i}`)));

    await refreshFoodLibrary(db, 's1');

    expect(variantCalls).toHaveLength(FOOD_VARIANTS_KEPT);
  });

  it('finds a food by brand or name, ignoring case, and pages the list', async () => {
    serve([
      food('a', 'Apple', 'Orchard'),
      food('b', 'Bread'),
      food('c', 'Cheese'),
    ]);
    await refreshFoodLibrary(db, 's1');

    const byBrand = await readSavedFoodsPage(db, 's1', 'orchard', 1, 20);
    expect(byBrand?.foods.map((item) => item.id)).toEqual(['a']);
    const page = await readSavedFoodsPage(db, 's1', '', 2, 2);
    expect(page?.totalCount).toBe(3);
    expect(page?.foods.map((item) => item.id)).toEqual(['a']);
    // A typed % is text, not "anything".
    expect((await readSavedFoodsPage(db, 's1', '%', 1, 20))?.foods).toEqual([]);
  });

  it('says nothing is kept when no library was ever downloaded', async () => {
    expect(await readSavedFoodsPage(db, 's1', '', 1, 20)).toBeNull();
  });

  it('answers servings from the default one when the rest were not kept', async () => {
    serve(Array.from({ length: 150 }, (_, i) => food(`f${i}`, `Food ${i}`)));
    await refreshFoodLibrary(db, 's1');

    // f149 is beyond the foods whose servings were downloaded.
    const variants = await readSavedVariants(db, 's1', 'f149');
    expect(variants).toHaveLength(1);
    expect(variants?.[0]).toMatchObject({ id: 'v-f149', food_id: 'f149' });
    expect(await readSavedVariants(db, 's1', 'unknown')).toBeNull();
  });

  it('keeps what it had when the server stops answering part-way', async () => {
    serve([food('a', 'Apple')]);
    await refreshFoodLibrary(db, 's1');
    serve([food('z', 'Zucchini')], '/api/foods/foods-paginated');

    await expect(refreshFoodLibrary(db, 's1')).rejects.toBeInstanceOf(
      TypeError
    );

    expect(
      (await listCacheRows(db, 's1', CACHE_COLLECTIONS.food)).map((r) => r.key)
    ).toEqual(['a']);
  });

  it('writes nothing when the account changes part-way', async () => {
    serve([food('a', 'Apple')]);
    const started = accountGeneration();
    bumpAccountGeneration();

    await refreshFoodLibrary(db, 's1', started);

    expect(await listCacheRows(db, 's1', CACHE_COLLECTIONS.food)).toEqual([]);
  });

  describe('through the API clients with the server away', () => {
    beforeEach(async () => {
      serve([
        { ...food('a', 'Apple'), barcode: ' 5000000000017 ' } as FoodItem,
        food('b', 'Bread'),
      ]);
      await refreshFoodLibrary(db, 's1');
      mockApiFetch.mockRejectedValue(new TypeError('Network request failed'));
    });

    it('searches the kept foods', async () => {
      const result = await fetchFoodsPage({ searchTerm: 'bre' });
      expect(result.foods.map((item) => item.id)).toEqual(['b']);
      expect(result.pagination.totalCount).toBe(1);
    });

    it('does not answer a nutrient sort from a list kept by name', async () => {
      await expect(
        fetchFoodsPage({ searchTerm: '', sortBy: 'calories:desc' })
      ).rejects.toBeInstanceOf(TypeError);
    });

    it('answers a barcode scan from the foods kept, with their servings', async () => {
      const result = await lookupBarcodeV2('5000000000017');

      expect(result.source).toBe('local');
      expect(result.food).toMatchObject({
        id: 'a',
        name: 'Apple',
        barcode: '5000000000017',
      });
      expect(result.food?.variants).toHaveLength(1);
    });

    it('does not answer a barcode the phone does not know', async () => {
      await expect(lookupBarcodeV2('0000000000000')).rejects.toBeInstanceOf(
        TypeError
      );
    });

    it('finds a saved meal by name and opens one by id', async () => {
      expect((await searchMeals('stew')).map((meal) => meal.id)).toEqual([
        'meal-2',
      ]);
      expect((await fetchMeal('meal-1')).name).toBe('Porridge');
      expect(await fetchMeals()).toHaveLength(2);
    });

    it('answers servings and meal types', async () => {
      expect(await fetchFoodVariants('a')).toHaveLength(1);
      expect((await fetchMealTypes())[0].name).toBe('Breakfast');
    });
  });
});
