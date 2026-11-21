import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  searchCookTool,
  getCookToolDetails,
  lookupCookToolBarcode,
  cooktoolAdapter,
} from '../integrations/cooktool/cooktoolService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import searchBananaFixture from './fixtures/cooktool/search_banana.json';
import ingredientNutrientsFixture from './fixtures/cooktool/ingredient_6433_nutrients.json';
import brandedCheeriosFixture from './fixtures/cooktool/branded_gtin_00016000232310.json';

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

describe('CookTool Service', () => {
  const credentials = { app_key: 'test_ctk_key_12345' };
  const provider = {
    id: 'p_cooktool_1',
    provider_type: 'cooktool' as const,
    app_key: 'test_ctk_key_12345',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detailCache.clear();
  });

  afterEach(() => {
    detailCache.clear();
  });

  describe('searchCookTool', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await searchCookTool({
        query: '   ',
        credentials,
      });
      expect(res.foods).toEqual([]);
      expect(res.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches ingredients and branded in parallel and merges results', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({ data: [{ id: 6433, name: 'Bananas, raw' }] })
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            data: [
              {
                id: 1994784,
                name: 'Banana Chips',
                brand: 'Sun Brand',
              },
            ],
          })
        );

      const res = await searchCookTool({
        query: 'banana',
        credentials,
        page: 1,
        pageSize: 20,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.foods).toHaveLength(2);
      expect(res.foods[0]).toEqual({
        id: 'ing:6433',
        name: 'Bananas, raw',
        serving_size: 100,
        serving_unit: 'g',
        is_partial: true,
        calories: undefined,
      });
      expect(res.foods[1]).toEqual({
        id: 'br:1994784',
        name: 'Banana Chips',
        brand: 'Sun Brand',
        serving_size: 100,
        serving_unit: 'g',
        is_partial: true,
        calories: undefined,
      });
      expect(res.hasMore).toBe(false);
    });

    it('still returns ingredients if branded search fails', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({ data: [{ id: 6433, name: 'Bananas, raw' }] })
        )
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => 'Internal Server Error',
          headers: new Headers({ 'content-type': 'text/plain' }),
        });

      const res = await searchCookTool({
        query: 'banana',
        credentials,
        page: 1,
        pageSize: 20,
      });

      expect(res.foods).toHaveLength(1);
      expect(res.foods[0].id).toBe('ing:6433');
    });

    it('throws if both search requests fail', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => 'Error 1',
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => 'Error 2',
          headers: new Headers(),
        });

      await expect(
        searchCookTool({
          query: 'banana',
          credentials,
        })
      ).rejects.toThrow();
    });
  });

  describe('getCookToolDetails', () => {
    it('fetches ingredient nutrients and maps to standard fields', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(ingredientNutrientsFixture)
      );

      const food = await getCookToolDetails({
        externalId: 'ing:6433',
        credentials,
        provider,
      });

      expect(food.name).toBe('Bananas, raw');
      expect(food.provider_type).toBe('cooktool');
      expect(food.provider_external_id).toBe('ing:6433');
      expect(food.default_variant.calories).toBe(89);
      expect(food.default_variant.protein).toBe(1.1);
      expect(food.default_variant.fat).toBe(0.3);
      expect(food.default_variant.carbs).toBe(22.8);
      expect(food.default_variant.dietary_fiber).toBe(2.6);
      expect(food.default_variant.potassium).toBe(358);
      expect(food.default_variant.sodium).toBe(1);
      expect(food.default_variant.iron).toBe(0.3);

      // Verify cached on subsequent call
      const cached = await getCookToolDetails({
        externalId: 'ing:6433',
        credentials,
        provider,
      });
      expect(cached).toBe(food);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches branded detail and returns mapped food', async () => {
      const food = await getCookToolDetails({
        externalId: 'br:1994784',
        credentials,
        provider,
      });

      expect(food.name).toBe('CookTool Branded Product #1994784');
      expect(food.provider_type).toBe('cooktool');
      expect(food.default_variant.serving_size).toBe(100);
    });
  });

  describe('lookupCookToolBarcode', () => {
    it('finds product by barcode', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(brandedCheeriosFixture));

      const match = await lookupCookToolBarcode({
        barcode: '00016000232310',
        credentials,
        provider,
      });

      expect(match).not.toBeNull();
      expect(match?.name).toBe(
        'Apple Cinnamon Cheerios Breakfast Cereal 2 Pack'
      );
      expect(match?.brand).toBe('Cheerios');
      expect(match?.provider_type).toBe('cooktool');
      expect(match?.barcode).toBe('00016000232310');
    });

    it('returns null if barcode is not found on any candidate format', async () => {
      mockFetch.mockResolvedValue(
        mockJsonResponse({ data: [], limit: 20, offset: 0 })
      );

      const match = await lookupCookToolBarcode({
        barcode: '999999999999',
        credentials,
        provider,
      });

      expect(match).toBeNull();
    });
  });

  describe('cooktoolAdapter', () => {
    it('exports all 3 required adapter functions', () => {
      expect(cooktoolAdapter.search).toBe(searchCookTool);
      expect(cooktoolAdapter.getDetails).toBe(getCookToolDetails);
      expect(cooktoolAdapter.lookupBarcode).toBe(lookupCookToolBarcode);
    });
  });
});
