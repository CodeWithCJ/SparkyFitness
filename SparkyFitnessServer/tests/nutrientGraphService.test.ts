import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  searchNutrientGraph,
  getNutrientGraphDetails,
  lookupNutrientGraphBarcode,
  nutrientGraphAdapter,
} from '../integrations/nutrientgraph/nutrientGraphService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import type { ProviderCallContext } from '../integrations/foodProviders/types.js';

const searchBananaEnFixture = JSON.parse(
  fs.readFileSync(
    new URL('./fixtures/nutrientgraph/search_banana_en.json', import.meta.url),
    'utf-8'
  )
);
const foodFdcFixture = JSON.parse(
  fs.readFileSync(
    new URL('./fixtures/nutrientgraph/food_fdc_171477.json', import.meta.url),
    'utf-8'
  )
);
const foodCiqualFixture = JSON.parse(
  fs.readFileSync(
    new URL('./fixtures/nutrientgraph/food_ciqual_20034.json', import.meta.url),
    'utf-8'
  )
);
const barcodeFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/nutrientgraph/barcode_00016000228986.json',
      import.meta.url
    ),
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

describe('NutrientGraph Service', () => {
  const ctx: ProviderCallContext = {
    userId: 'user-1',
    credentialUserId: 'user-1',
    credentials: { app_key: 'test_ng_key_abc123' },
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

  describe('searchNutrientGraph', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await searchNutrientGraph(ctx, '   ');
      expect(res.foods).toEqual([]);
      expect(res.pagination.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches with language and maps results', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(searchBananaEnFixture))
        .mockResolvedValueOnce(mockJsonResponse(foodFdcFixture))
        .mockResolvedValueOnce(mockJsonResponse(foodFdcFixture))
        .mockResolvedValueOnce(mockJsonResponse(foodFdcFixture));

      const res = await searchNutrientGraph(ctx, 'banana', 1, 3);

      expect(mockFetch).toHaveBeenCalledTimes(4);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('lang=en');
      expect(url).toContain('q=banana');
      expect(url).toContain('limit=3');
      expect(url).toContain('offset=0');

      expect(res.foods).toHaveLength(3);
      expect(res.foods[0]).toMatchObject({
        name: 'Bananas, raw',
        brand: null,
        provider_external_id: 'fdc:173944',
        provider_type: 'nutrientgraph',
        is_custom: false,
        default_variant: expect.objectContaining({
          serving_size: 100,
          serving_unit: 'g',
          calories: 165,
          protein: 31,
          is_default: true,
        }),
      });
      expect(res.pagination.hasMore).toBe(true);
    });

    it('falls back unsupported language to en', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(searchBananaEnFixture));

      await searchNutrientGraph({ ...ctx, language: 'sv' }, 'banana');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('lang=en');
    });
  });

  describe('getNutrientGraphDetails', () => {
    it('fetches USDA food details by encoded id, maps nutrients and portions', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(foodFdcFixture));

      const food = await getNutrientGraphDetails(ctx, 'fdc:171477');

      expect(food).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v1/food/foods/fdc%3A171477');

      expect(food?.name).toBe(
        'Chicken, broilers or fryers, breast, meat only, cooked, roasted'
      );
      expect(food?.provider_type).toBe('nutrientgraph');
      expect(food?.provider_external_id).toBe('fdc:171477');
      expect(food?.default_variant.calories).toBe(165);
      expect(food?.default_variant.protein).toBe(31);
      expect(food?.default_variant.fat).toBe(3.6);
      expect(food?.default_variant.carbs).toBe(0);
      expect(food?.default_variant.cholesterol).toBe(85);
      expect(food?.default_variant.sodium).toBe(74);
      expect(food?.default_variant.potassium).toBe(256);
      expect(food?.default_variant.water_ml).toBe(65.3);

      // Verify portions: primary portion is first variant after 100g
      expect(food?.variants).toHaveLength(4);
      expect(food?.variants[1].serving_unit).toBe(
        '1 cup, chopped or diced (140 g)'
      );
      expect(food?.variants[1].serving_size).toBe(1);
      expect(food?.variants[1].calories).toBe(Math.round(165 * 1.4));

      // Verify cached
      const cached = await getNutrientGraphDetails(ctx, 'fdc:171477');
      expect(cached).toEqual(food);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches CIQUAL food details and chooses requested language name', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(foodCiqualFixture));

      const food = await getNutrientGraphDetails(
        { ...ctx, language: 'de' },
        'ciqual:20034'
      );

      expect(food).not.toBeNull();
      expect(food?.name).toBe('Zwiebel, roh');
      expect(food?.provider_external_id).toBe('ciqual:20034');
    });
  });

  describe('lookupNutrientGraphBarcode', () => {
    it('finds product by barcode and maps nutrition', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(barcodeFixture));

      const match = await lookupNutrientGraphBarcode(ctx, '016000228986');

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

      const match = await lookupNutrientGraphBarcode(ctx, '999999999999');

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
