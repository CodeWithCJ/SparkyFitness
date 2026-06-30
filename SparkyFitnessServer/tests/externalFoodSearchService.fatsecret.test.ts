import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../services/foodIntegrationService.js', () => ({
  getFatSecretNutrients: vi.fn(),
  searchFatSecretFoods: vi.fn(),
  searchMealieFoods: vi.fn(),
  searchTandoorFoods: vi.fn(),
  searchNorishFoods: vi.fn(),
}));

vi.mock('../integrations/fatsecret/fatsecretService.js', () => ({
  mapFatSecretSearchItem: vi.fn((item) => item),
  mapFatSecretFood: vi.fn(),
  foodNutrientCache: new Map(),
  getFatSecretAccessToken: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getProviderCredentials: vi.fn() },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../integrations/openfoodfacts/openFoodFactsService.js', () => ({
  searchOpenFoodFacts: vi.fn(),
  mapOpenFoodFactsProduct: vi.fn(),
}));
vi.mock('../integrations/usda/usdaService.js', () => ({
  searchUsdaFoods: vi.fn(),
  mapUsdaBarcodeProduct: vi.fn(),
}));
vi.mock('../integrations/yazio/yazioService.js', () => ({
  searchYazioFoods: vi.fn(),
}));
vi.mock('../integrations/swissfood/swissFoodService.js', () => ({
  searchSwissFoods: vi.fn(),
}));

import { getFatSecretNutrients } from '../services/foodIntegrationService.js';
import {
  mapFatSecretFood,
  foodNutrientCache,
  getFatSecretAccessToken,
} from '../integrations/fatsecret/fatsecretService.js';
import { log } from '../config/logging.js';
import { enrichFatSecretResults } from '../services/externalFoodSearchService.js';

const mockGetFatSecretNutrients = vi.mocked(getFatSecretNutrients);
const mockMapFatSecretFood = vi.mocked(mapFatSecretFood);
const mockGetFatSecretAccessToken = vi.mocked(getFatSecretAccessToken);
const mockLog = vi.mocked(log);
const mockCache = foodNutrientCache as Map<
  string,
  { data: unknown; expiry: number }
>;

function makeSearchItem(id: string, calories: number) {
  return {
    name: `Food ${id}`,
    brand: null,
    provider_external_id: id,
    provider_type: 'fatsecret' as const,
    is_custom: false,
    default_variant: {
      serving_size: 1,
      serving_unit: 'serving',
      calories,
      protein: 10,
      carbs: 20,
      fat: 5,
      is_default: true,
    },
  };
}

function makeDetailVariant(calories: number) {
  return {
    serving_size: 57,
    serving_unit: 'g',
    calories,
    protein: 16,
    carbs: 46,
    fat: 32,
    is_default: true,
  };
}

function makeDetailResult(id: string, calories: number) {
  const variant = makeDetailVariant(calories);
  return {
    name: `Food ${id}`,
    brand: null,
    barcode: undefined,
    provider_external_id: id,
    provider_type: 'fatsecret',
    is_custom: false,
    default_variant: variant,
    variants: [variant],
  };
}

function seedCache(id: string, calories: number) {
  mockCache.set(id, {
    data: { food: { food_id: id } },
    expiry: Date.now() + 5 * 60 * 1000,
  });
  mockMapFatSecretFood.mockReturnValue(
    makeDetailResult(id, calories) as ReturnType<typeof mapFatSecretFood>
  );
}

describe('enrichFatSecretResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.clear();
    mockGetFatSecretAccessToken.mockResolvedValue('token');
  });

  it('prefetches the access token once before firing parallel detail requests', async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeSearchItem(String(i), 500)
    );
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 370) as ReturnType<typeof mapFatSecretFood>
    );

    await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(mockGetFatSecretAccessToken).toHaveBeenCalledTimes(1);
    expect(mockGetFatSecretAccessToken).toHaveBeenCalledWith(
      'app_id',
      'app_key'
    );
  });

  it('does not prefetch the token when there are no items to enrich', async () => {
    await enrichFatSecretResults([], 'app_id', 'app_key');

    expect(mockGetFatSecretAccessToken).not.toHaveBeenCalled();
  });

  it('continues enrichment even if the token prefetch fails', async () => {
    const items = [makeSearchItem('1', 300)];
    mockGetFatSecretAccessToken.mockRejectedValue(new Error('token error'));
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('1', 370) as ReturnType<typeof mapFatSecretFood>
    );

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result[0]!.default_variant.calories).toBe(370);
    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      'FatSecret access token prefetch failed:',
      expect.any(Error)
    );
  });

  it('top 5 results are enriched via API call with detail default_variant and variants', async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeSearchItem(String(i), 500)
    );
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 370) as ReturnType<typeof mapFatSecretFood>
    );

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(mockGetFatSecretNutrients).toHaveBeenCalledTimes(5);
    result.forEach((item) => {
      expect(item!.default_variant.calories).toBe(370);
      expect((item as { variants?: unknown[] }).variants).toHaveLength(1);
    });
  });

  it('results beyond top 5 are enriched from cache when warm', async () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      makeSearchItem(String(i), 500)
    );
    // Top 5 via API
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 370) as ReturnType<typeof mapFatSecretFood>
    );
    // Item 5 cached, item 6 not cached
    seedCache('5', 420);

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(mockGetFatSecretNutrients).toHaveBeenCalledTimes(5);
    expect(result[5]!.default_variant.calories).toBe(420);
    expect(result[6]!.default_variant.calories).toBe(500); // unchanged
  });

  it('treats a malformed cache entry (non-numeric expiry) as expired', async () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      makeSearchItem(String(i), 500)
    );
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 370) as ReturnType<typeof mapFatSecretFood>
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCache.set('5', { data: { food: {} }, expiry: undefined as any });

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result[5]!.default_variant.calories).toBe(500); // unchanged, treated as expired
  });

  it('results beyond top 5 stay as search-mapped when cache is cold', async () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      makeSearchItem(String(i), i * 10)
    );
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 999) as ReturnType<typeof mapFatSecretFood>
    );

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result[5]!.default_variant.calories).toBe(50);
    expect(result[6]!.default_variant.calories).toBe(60);
  });

  it('falls back to original item and logs warn when top-5 API call fails', async () => {
    const items = [makeSearchItem('bad', 300)];
    mockGetFatSecretNutrients.mockRejectedValue(new Error('timeout'));

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result[0]!.default_variant.calories).toBe(300);
    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('bad'),
      expect.any(Error)
    );
  });

  it('returns original item unchanged when detail fetch resolves to null/undefined', async () => {
    const items = [makeSearchItem('null-detail', 300)];
    mockGetFatSecretNutrients.mockResolvedValue(null);

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result[0]!.default_variant.calories).toBe(300);
    expect(mockMapFatSecretFood).not.toHaveBeenCalled();
  });

  it('preserves item order across top-5 and remainder', async () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeSearchItem(String(i), i * 100)
    );
    mockGetFatSecretNutrients.mockResolvedValue({ food: {} });
    mockMapFatSecretFood.mockReturnValue(
      makeDetailResult('x', 999) as ReturnType<typeof mapFatSecretFood>
    );

    const result = await enrichFatSecretResults(items, 'app_id', 'app_key');

    expect(result).toHaveLength(8);
    // Top 5 enriched
    result
      .slice(0, 5)
      .forEach((item) => expect(item!.default_variant.calories).toBe(999));
    // Remainder unchanged (no cache)
    result
      .slice(5)
      .forEach((item, i) =>
        expect(item!.default_variant.calories).toBe((i + 5) * 100)
      );
  });

  it('passes through items without provider_external_id untouched', async () => {
    const item = makeSearchItem('', 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item as any).provider_external_id = undefined;

    const result = await enrichFatSecretResults(
      [item as never],
      'app_id',
      'app_key'
    );

    expect(result[0]!.default_variant.calories).toBe(100);
    expect(mockGetFatSecretNutrients).not.toHaveBeenCalled();
  });
});
