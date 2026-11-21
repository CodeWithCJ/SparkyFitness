import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  searchNutrientGraph,
  getNutrientGraphDetails,
  lookupNutrientGraphBarcode,
  nutrientGraphAdapter,
} from '../integrations/nutrientgraph/nutrientGraphService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import searchBananaEnFixture from './fixtures/nutrientgraph/search_banana_en.json';
import foodFdcFixture from './fixtures/nutrientgraph/food_fdc_171477.json';
import foodCiqualFixture from './fixtures/nutrientgraph/food_ciqual_20034.json';
import barcodeFixture from './fixtures/nutrientgraph/barcode_00016000228986.json';

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

describe('NutrientGraph Service', () => {
  const credentials = { app_key: 'test_ng_key_abc123' };
  const provider = {
    id: 'p_ng_1',
    provider_type: 'nutrientgraph' as const,
    app_key: 'test_ng_key_abc123',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detailCache.clear();
  });

  afterEach(() => {
    detailCache.clear();
  });

  describe('searchNutrientGraph', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await searchNutrientGraph({
        query: '   ',
        credentials,
      });
      expect(res.foods).toEqual([]);
      expect(res.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches with language and maps results', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(searchBananaEnFixture));

      const res = await searchNutrientGraph({
        query: 'banana',
        credentials,
        language: 'en',
        page: 1,
        pageSize: 3,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('lang=en');
      expect(url).toContain('q=banana');
      expect(url).toContain('limit=3');
      expect(url).toContain('offset=0');

      expect(res.foods).toHaveLength(3);
      expect(res.foods[0]).toEqual({
        id: 'fdc:173944',
        name: 'Bananas, raw',
        calories: 89,
        serving_size: 100,
        serving_unit: 'g',
        is_partial: true,
      });
      expect(res.hasMore).toBe(true);
    });

    it('falls back unsupported language to en', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(searchBananaEnFixture));

      await searchNutrientGraph({
        query: 'banana',
        credentials,
        language: 'sv',
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('lang=en');
    });
  });

  describe('getNutrientGraphDetails', () => {
    it('fetches USDA food details by encoded id, maps nutrients and portions', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(foodFdcFixture));

      const food = await getNutrientGraphDetails({
        externalId: 'fdc:171477',
        credentials,
        provider,
        language: 'en',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v1/food/foods/fdc%3A171477');

      expect(food.name).toBe(
        'Chicken, broilers or fryers, breast, meat only, cooked, roasted'
      );
      expect(food.provider_type).toBe('nutrientgraph');
      expect(food.provider_external_id).toBe('fdc:171477');
      expect(food.default_variant.calories).toBe(165);
      expect(food.default_variant.protein).toBe(31);
      expect(food.default_variant.fat).toBe(3.6);
      expect(food.default_variant.carbs).toBe(0);
      expect(food.default_variant.cholesterol).toBe(85);
      expect(food.default_variant.sodium).toBe(74);
      expect(food.default_variant.potassium).toBe(256);
      expect(food.default_variant.water_ml).toBe(65.3);

      // Verify portions: primary portion is first variant after 100g
      expect(food.variants).toHaveLength(4);
      expect(food.variants[1].serving_unit).toBe('1 cup, chopped or diced');
      expect(food.variants[1].serving_size).toBe(140);
      expect(food.variants[1].calories).toBe(Math.round(165 * 1.4));

      // Verify cached
      const cached = await getNutrientGraphDetails({
        externalId: 'fdc:171477',
        credentials,
        provider,
      });
      expect(cached).toBe(food);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches CIQUAL food details and chooses requested language name', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(foodCiqualFixture));

      const food = await getNutrientGraphDetails({
        externalId: 'ciqual:20034',
        credentials,
        provider,
        language: 'de',
      });

      expect(food.name).toBe('Zwiebel, roh');
      expect(food.provider_external_id).toBe('ciqual:20034');
    });
  });

  describe('lookupNutrientGraphBarcode', () => {
    it('finds product by barcode and maps nutrition', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(barcodeFixture));

      const match = await lookupNutrientGraphBarcode({
        barcode: '016000228986',
        credentials,
        provider,
      });

      expect(match).not.toBeNull();
      expect(match?.name).toBe(
        'Dunkaroos Cinnamon Graham Cookie Vanilla Frosting 12 Count'
      );
      expect(match?.brand).toBe('GENERAL MILLS SALES INC.');
      expect(match?.barcode).toBe('00016000228986');
      expect(match?.default_variant.calories).toBe(429);
      expect(match?.default_variant.fat).toBe(14.3);
      expect(match?.default_variant.carbs).toBe(71.4);
      expect(match?.default_variant.sugars).toBe(45.2);
    });

    it('returns null on failure or error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => 'Not found',
        headers: new Headers(),
      });

      const match = await lookupNutrientGraphBarcode({
        barcode: '999999999999',
        credentials,
        provider,
      });

      expect(match).toBeNull();
    });
  });

  describe('nutrientGraphAdapter', () => {
    it('exports all 3 required adapter functions', () => {
      expect(nutrientGraphAdapter.search).toBe(searchNutrientGraph);
      expect(nutrientGraphAdapter.getDetails).toBe(getNutrientGraphDetails);
      expect(nutrientGraphAdapter.lookupBarcode).toBe(
        lookupNutrientGraphBarcode
      );
    });
  });
});
