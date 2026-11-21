import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  searchFoodInfo,
  getFoodInfoDetails,
  foodInfoAdapter,
} from '../integrations/foodinfo/foodInfoService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import type { ProviderCallContext } from '../integrations/foodProviders/types.js';

const searchBananaFixture = JSON.parse(
  fs.readFileSync(
    new URL('./fixtures/foodinfo/search_banana.json', import.meta.url),
    'utf-8'
  )
);
const panel790774Fixture = JSON.parse(
  fs.readFileSync(
    new URL('./fixtures/foodinfo/panel_790774.json', import.meta.url),
    'utf-8'
  )
);

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

import { normalizeFoodForResponse } from '../services/foodProviderDetailService.js';
import { SearchResponseSchema } from '../schemas/foodSchemas.js';

describe('Food Info Service', () => {
  const ctx: ProviderCallContext = {
    userId: 'user-1',
    credentialUserId: 'user-1',
    credentials: { app_key: 'test_fi_key_12345' },
    language: 'en',
    autoScale: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detailCache.clear();
  });

  afterEach(() => {
    detailCache.clear();
  });

  describe('searchFoodInfo', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await searchFoodInfo(ctx, '   ');
      expect(res.foods).toEqual([]);
      expect(res.pagination.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches foods and enriches results with details', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(searchBananaFixture))
        .mockResolvedValueOnce(mockJsonResponse(panel790774Fixture))
        .mockResolvedValueOnce(mockJsonResponse(panel790774Fixture))
        .mockResolvedValueOnce(mockJsonResponse(panel790774Fixture));

      const res = await searchFoodInfo(ctx, 'banana', 1, 3);

      expect(mockFetch).toHaveBeenCalledTimes(4);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('q=banana');
      expect(url).toContain('limit=3');

      expect(res.foods).toHaveLength(3);
      expect(res.foods[0]).toMatchObject({
        name: 'Bananas, overripe, raw',
        brand: null,
        provider_external_id: '790774',
        provider_type: 'food-info',
        is_custom: false,
        default_variant: expect.objectContaining({
          serving_size: 100,
          serving_unit: 'g',
          calories: 85,
          protein: 0.7,
          is_default: true,
        }),
      });
      expect(res.pagination.hasMore).toBe(true);

      const normalized = res.foods.map(normalizeFoodForResponse);
      expect(() =>
        SearchResponseSchema.parse({
          foods: normalized,
          pagination: res.pagination,
        })
      ).not.toThrow();
    });

    it('falls back to search summary when detail enrichment fails', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(searchBananaFixture));
      // Remaining detail calls will fail since mockFetch is not configured for them

      const res = await searchFoodInfo(ctx, 'banana', 1, 3);

      expect(res.foods).toHaveLength(3);
      expect(res.foods[0]).toMatchObject({
        name: 'Bananas, overripe, raw',
        brand: null,
        provider_external_id: '790774',
        provider_type: 'food-info',
        is_custom: false,
        default_variant: expect.objectContaining({
          serving_size: 100,
          serving_unit: 'g',
          calories: 0,
          is_default: true,
        }),
      });
    });
  });

  describe('getFoodInfoDetails', () => {
    it('fetches food panel and maps nutrients and portions', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(panel790774Fixture));

      const food = await getFoodInfoDetails(ctx, '790774');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/foods/790774/panel');

      expect(food).not.toBeNull();
      expect(food?.name).toBe('Bananas, overripe, raw');
      expect(food?.provider_type).toBe('food-info');
      expect(food?.provider_external_id).toBe('790774');
      expect(food?.default_variant.calories).toBe(85);
      expect(food?.default_variant.protein).toBe(0.7);
      expect(food?.default_variant.fat).toBe(0.2);
      expect(food?.default_variant.carbs).toBe(20.1);
      expect(food?.default_variant.dietary_fiber).toBe(1.7);
      expect(food?.default_variant.water_ml).toBe(78.3);
      expect(food?.default_variant.vitamin_c).toBe(9.7);

      // Verify portions: availableServings had '1 Banana Peeled' (110g)
      expect(food?.variants).toHaveLength(2);
      expect(food?.variants[1].serving_unit).toBe('1 Banana Peeled');
      expect(food?.variants[1].serving_size).toBe(110);
      expect(food?.variants[1].calories).toBe(Math.round(85 * 1.1));

      // Verify caching
      const cached = await getFoodInfoDetails(ctx, '790774');
      expect(cached).toBe(food);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('foodInfoAdapter', () => {
    it('exports search and getDetails, but does not support barcode', () => {
      expect(foodInfoAdapter.search).toBe(searchFoodInfo);
      expect(foodInfoAdapter.getDetails).toBe(getFoodInfoDetails);
      expect(foodInfoAdapter.lookupBarcode).toBeUndefined();
    });
  });
});
