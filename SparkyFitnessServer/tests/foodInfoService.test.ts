import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  searchFoodInfo,
  getFoodInfoDetails,
  foodInfoAdapter,
} from '../integrations/foodinfo/foodInfoService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import searchBananaFixture from './fixtures/foodinfo/search_banana.json';
import panel790774Fixture from './fixtures/foodinfo/panel_790774.json';

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

describe('Food Info Service', () => {
  const credentials = { app_key: 'test_fi_key_12345' };
  const provider = {
    id: 'p_fi_1',
    provider_type: 'food-info' as const,
    app_key: 'test_fi_key_12345',
    is_active: true,
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
      const res = await searchFoodInfo({
        query: '   ',
        credentials,
      });
      expect(res.foods).toEqual([]);
      expect(res.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches foods and maps results', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(searchBananaFixture));

      const res = await searchFoodInfo({
        query: 'banana',
        credentials,
        pageSize: 3,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('q=banana');
      expect(url).toContain('limit=3');

      expect(res.foods).toHaveLength(3);
      expect(res.foods[0]).toEqual({
        id: '790774',
        name: 'Bananas, overripe, raw',
        calories: undefined,
        serving_size: 100,
        serving_unit: 'g',
        is_partial: true,
      });
      expect(res.hasMore).toBe(true);
    });
  });

  describe('getFoodInfoDetails', () => {
    it('fetches food panel and maps nutrients and portions', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(panel790774Fixture));

      const food = await getFoodInfoDetails({
        externalId: '790774',
        credentials,
        provider,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/foods/790774/panel');

      expect(food.name).toBe('Bananas, overripe, raw');
      expect(food.provider_type).toBe('food-info');
      expect(food.provider_external_id).toBe('790774');
      expect(food.default_variant.calories).toBe(85);
      expect(food.default_variant.protein).toBe(0.7);
      expect(food.default_variant.fat).toBe(0.2);
      expect(food.default_variant.carbs).toBe(20.1);
      expect(food.default_variant.dietary_fiber).toBe(1.7);
      expect(food.default_variant.water_ml).toBe(78.3);
      expect(food.default_variant.vitamin_c).toBe(9.7);

      // Verify portions: availableServings had '1 Banana Peeled' (110g)
      expect(food.variants).toHaveLength(2);
      expect(food.variants[1].serving_unit).toBe('1 Banana Peeled');
      expect(food.variants[1].serving_size).toBe(110);
      expect(food.variants[1].calories).toBe(Math.round(85 * 1.1));

      // Verify caching
      const cached = await getFoodInfoDetails({
        externalId: '790774',
        credentials,
        provider,
      });
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
