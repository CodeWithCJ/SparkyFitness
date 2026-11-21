import { apiFetch } from '../services/api/apiClient';
import type {
  FoodItem,
  FoodsResponse,
  FoodVariantDetail,
  FoodSearchResponse,
} from '../types/foods';
import type {
  BarcodeLookupResult,
  NormalizedFoodVariant,
} from '../services/api/externalFoodSearchApi';
import type { Meal } from '../types/meals';
import type { MealType } from '../types/mealTypes';
import type { WaterContainer } from '../types/measurements';
import { accountGeneration } from './accountGeneration';
import {
  getCacheRow,
  putCacheRows,
  replaceCacheCollection,
  searchCacheRowsPage,
  listCacheRowsPage,
  type CacheWrite,
} from './cacheStore';
import { CACHE_COLLECTIONS, SINGLE_DOCUMENT_KEY } from './collections';
import type { OfflineDb } from './types';

const SERVICE = 'Offline pack';

/**
 * The most foods kept on the phone. A library can hold tens of thousands (a
 * bulk import, a shared database); the phone keeps what the person uses
 * first, then their own foods by name, up to this many.
 */
export const FOOD_LIBRARY_MAX = 2000;
const FOODS_PAGE_SIZE = 100;
/** Foods whose other servings are kept too: the first this many. */
export const FOOD_VARIANTS_KEPT = 100;
const VARIANT_BATCH = 5;
/** The most meals read back at once; a person's saved meals are far fewer. */
const MEALS_READ_MAX = 1000;

/** What the search matches, the way the server does: "brand name". */
export function foodSearchName(food: Pick<FoodItem, 'name' | 'brand'>): string {
  return `${food.brand ?? ''} ${food.name}`.trim();
}

/** The barcodes of the foods kept, each pointing at its food. */
export function barcodeCacheRows(foods: readonly FoodItem[]): CacheWrite[] {
  const rows: CacheWrite[] = [];
  for (const food of foods) {
    const barcode = food.barcode?.trim();
    if (barcode) rows.push({ key: barcode, payload: { foodId: food.id } });
  }
  return rows;
}

export function foodCacheRows(foods: readonly FoodItem[]): CacheWrite[] {
  return foods.map((food) => ({
    key: food.id,
    name: foodSearchName(food),
    payload: food,
  }));
}

/**
 * The foods to keep, in the order they matter: recent, then most used, then
 * the person's own foods by name. Each food once, at most `limit`.
 */
export function chooseFoodsToKeep(
  usage: FoodsResponse,
  own: readonly FoodItem[],
  limit: number = FOOD_LIBRARY_MAX
): FoodItem[] {
  const seen = new Set<string>();
  const chosen: FoodItem[] = [];
  for (const food of [...usage.recentFoods, ...usage.topFoods, ...own]) {
    if (chosen.length >= limit) break;
    if (seen.has(food.id) || !food.default_variant) continue;
    seen.add(food.id);
    chosen.push(food);
  }
  return chosen;
}

/** The person's own foods by name, a page at a time, up to the cap. */
async function fetchOwnFoods(
  startedUnder: number,
  limit: number
): Promise<FoodItem[] | null> {
  const foods: FoodItem[] = [];
  for (let page = 1; foods.length < limit; page += 1) {
    if (accountGeneration() !== startedUnder) return null;
    const params = new URLSearchParams({
      searchTerm: '',
      foodFilter: 'mine',
      currentPage: String(page),
      itemsPerPage: String(FOODS_PAGE_SIZE),
      sortBy: 'name:asc',
    });
    const response = await apiFetch<FoodSearchResponse>({
      endpoint: `/api/foods/foods-paginated?${params.toString()}`,
      serviceName: SERVICE,
      operation: 'fetch foods',
    });
    foods.push(...response.foods);
    if (
      response.foods.length < FOODS_PAGE_SIZE ||
      page * FOODS_PAGE_SIZE >= response.totalCount
    ) {
      break;
    }
  }
  return foods;
}

async function refreshVariants(
  db: OfflineDb,
  serverConfigId: string,
  foods: readonly FoodItem[],
  startedUnder: number
): Promise<void> {
  const wanted = foods.slice(0, FOOD_VARIANTS_KEPT);
  for (let start = 0; start < wanted.length; start += VARIANT_BATCH) {
    if (accountGeneration() !== startedUnder) return;
    const batch = wanted.slice(start, start + VARIANT_BATCH);
    const answers = await Promise.all(
      batch.map((food) =>
        apiFetch<FoodVariantDetail[]>({
          endpoint: `/api/foods/food-variants?food_id=${encodeURIComponent(food.id)}`,
          serviceName: SERVICE,
          operation: 'fetch food servings',
        })
      )
    );
    if (accountGeneration() !== startedUnder) return;
    await putCacheRows(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.foodVariants,
      batch.map((food, index) => ({ key: food.id, payload: answers[index] }))
    );
  }
}

/**
 * Keeps the person's foods, their servings, the recent and most-used lists
 * and the meal types, so a food can be found and logged with no connection.
 * Goes straight to the server on purpose, like the rest of the pack: the
 * ordinary fetchers answer from the phone when the server is away, and a
 * refresh that read its own copy back would overwrite the list with itself.
 * Stops quietly when the account changes part-way.
 */
export async function refreshFoodLibrary(
  db: OfflineDb,
  serverConfigId: string,
  startedUnder: number = accountGeneration()
): Promise<void> {
  const usage = await apiFetch<FoodsResponse>({
    endpoint: '/api/foods',
    serviceName: SERVICE,
    operation: 'fetch recent foods',
  });
  const mealTypes = await apiFetch<MealType[]>({
    endpoint: '/api/meal-types',
    serviceName: SERVICE,
    operation: 'fetch meal types',
  });
  const containers = await apiFetch<WaterContainer[]>({
    endpoint: '/api/water-containers',
    serviceName: SERVICE,
    operation: 'fetch water containers',
  });
  const meals = await apiFetch<Meal[]>({
    endpoint: '/api/meals',
    serviceName: SERVICE,
    operation: 'fetch meals',
  });
  const own = await fetchOwnFoods(startedUnder, FOOD_LIBRARY_MAX);
  if (own == null || accountGeneration() !== startedUnder) return;

  const foods = chooseFoodsToKeep(usage, own);
  await replaceCacheCollection(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.food,
    foodCacheRows(foods)
  );
  await replaceCacheCollection(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.foodBarcode,
    barcodeCacheRows(foods)
  );
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.foodRecents, [
    { key: SINGLE_DOCUMENT_KEY, payload: usage },
  ]);
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.mealTypes, [
    { key: SINGLE_DOCUMENT_KEY, payload: mealTypes },
  ]);
  await replaceCacheCollection(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.meal,
    (Array.isArray(meals) ? meals : []).map((meal) => ({
      key: meal.id,
      name: meal.name,
      payload: meal,
    }))
  );
  await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.waterContainers, [
    { key: SINGLE_DOCUMENT_KEY, payload: containers },
  ]);
  await refreshVariants(db, serverConfigId, foods, startedUnder);
}

/** One page of the foods kept on the phone, by name; null when none are. */
export async function readSavedFoodsPage(
  db: OfflineDb,
  serverConfigId: string,
  searchTerm: string,
  page: number,
  pageSize: number
): Promise<FoodSearchResponse | null> {
  const offset = (Math.max(page, 1) - 1) * pageSize;
  const term = searchTerm.trim();
  const { rows, total } = term
    ? await searchCacheRowsPage(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.food,
        term,
        pageSize,
        offset
      )
    : await listCacheRowsPage(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.food,
        pageSize,
        offset
      );
  // Nothing kept at all is "not available offline"; a search that matches
  // nothing among the kept foods is a real (empty) answer.
  if (total === 0 && !term) return null;
  return {
    foods: rows.map((row) => row.payload as FoodItem),
    totalCount: total,
  };
}

export async function readSavedFood(
  db: OfflineDb,
  serverConfigId: string,
  foodId: string
): Promise<FoodItem | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.food,
    foodId
  );
  return row ? (row.payload as FoodItem) : null;
}

/**
 * The servings of a food: the full list when it was kept, else the one
 * serving the kept food carries (its default), so a food can still be
 * logged in its usual serving.
 */
export async function readSavedVariants(
  db: OfflineDb,
  serverConfigId: string,
  foodId: string
): Promise<FoodVariantDetail[] | null> {
  const kept = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.foodVariants,
    foodId
  );
  if (kept) return kept.payload as FoodVariantDetail[];
  const food = await readSavedFood(db, serverConfigId, foodId);
  if (!food?.default_variant?.id) return null;
  return [
    {
      ...food.default_variant,
      id: food.default_variant.id,
      food_id: food.id,
    } as FoodVariantDetail,
  ];
}

export async function readSavedSingle<T>(
  db: OfflineDb,
  serverConfigId: string,
  collection: string
): Promise<T | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    collection,
    SINGLE_DOCUMENT_KEY
  );
  return row ? (row.payload as T) : null;
}

/** Every meal kept on the phone, by name; null when none were ever kept. */
export async function readSavedMeals(
  db: OfflineDb,
  serverConfigId: string,
  searchTerm = ''
): Promise<Meal[] | null> {
  const term = searchTerm.trim();
  const { rows, total } = term
    ? await searchCacheRowsPage(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.meal,
        term,
        MEALS_READ_MAX,
        0
      )
    : await listCacheRowsPage(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.meal,
        MEALS_READ_MAX,
        0
      );
  if (total === 0 && !term) return null;
  return rows.map((row) => row.payload as Meal);
}

export async function readSavedMeal(
  db: OfflineDb,
  serverConfigId: string,
  mealId: string
): Promise<Meal | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.meal,
    mealId
  );
  return row ? (row.payload as Meal) : null;
}

/**
 * The food kept for a scanned barcode, shaped like a lookup the server
 * answered from the person's own foods; null when no kept food has it. Only
 * the person's kept foods are known here, never a provider's.
 */
export async function readSavedBarcodeResult(
  db: OfflineDb,
  serverConfigId: string,
  barcode: string
): Promise<BarcodeLookupResult | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.foodBarcode,
    barcode.trim()
  );
  const foodId = (row?.payload as { foodId?: string } | undefined)?.foodId;
  if (!foodId) return null;
  const food = await readSavedFood(db, serverConfigId, foodId);
  if (!food?.default_variant) return null;
  const variants = (await readSavedVariants(db, serverConfigId, foodId)) ?? [
    food.default_variant,
  ];
  return {
    source: 'local',
    food: {
      id: food.id,
      name: food.name,
      brand: food.brand,
      barcode: barcode.trim(),
      is_custom: food.is_custom,
      provider_external_id: food.provider_external_id,
      provider_type: food.provider_type ?? undefined,
      provider_verified: food.provider_verified,
      images: food.images ?? undefined,
      default_variant: food.default_variant as NormalizedFoodVariant,
      variants: variants as NormalizedFoodVariant[],
    },
  };
}
