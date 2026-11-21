import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  searchCookTool,
  getCookToolDetails,
  lookupCookToolBarcode,
  cooktoolAdapter,
} from '../integrations/cooktool/cooktoolService.js';
import { detailCache } from '../integrations/foodProviders/detailCache.js';
import type { ProviderCallContext } from '../integrations/foodProviders/types.js';

const ingredientNutrientsFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/cooktool/ingredient_6433_nutrients.json',
      import.meta.url
    ),
    'utf-8'
  )
);
const brandedCheeriosFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/cooktool/branded_gtin_00016000232310.json',
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

describe('CookTool Service', () => {
  const ctx: ProviderCallContext = {
    userId: 'user-1',
    credentialUserId: 'user-1',
    credentials: { app_key: 'test_ctk_key_12345' },
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

  describe('searchCookTool', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await searchCookTool(ctx, '   ');
      expect(res.foods).toEqual([]);
      expect(res.pagination.hasMore).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('searches ingredients and enriches results with nutrients, excluding zero-nutrient items', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            data: [
              { id: 6433, name: 'Bananas, raw' },
              { id: 9999, name: 'Zero nutrient empty ingredient' },
            ],
          })
        )
        .mockResolvedValueOnce(mockJsonResponse(ingredientNutrientsFixture))
        .mockResolvedValueOnce(
          mockJsonResponse({
            ingredient_id: 9999,
            ingredient_name: 'Zero nutrient empty ingredient',
            country: 'US',
            nutrient_count: 0,
            nutrients: [],
          })
        );

      const res = await searchCookTool(ctx, 'banana', 1, 20);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      // The zero-nutrient item must be excluded from results
      expect(res.foods).toHaveLength(1);
      expect(res.foods[0]).toMatchObject({
        name: 'Bananas, raw',
        brand: null,
        provider_external_id: 'ing:6433',
        provider_type: 'cooktool',
        is_custom: false,
        default_variant: expect.objectContaining({
          serving_size: 100,
          serving_unit: 'g',
          calories: 89,
          protein: 1.1,
          is_default: true,
        }),
      });
      expect(res.pagination.hasMore).toBe(false);
    });

    it('throws if ingredients search fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      await expect(searchCookTool(ctx, 'banana')).rejects.toThrow();
    });
  });

  describe('getCookToolDetails', () => {
    it('fetches ingredient nutrients and maps to standard fields', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(ingredientNutrientsFixture)
      );

      const food = await getCookToolDetails(ctx, 'ing:6433');

      expect(food).not.toBeNull();
      expect(food?.name).toBe('Bananas, raw');
      expect(food?.provider_type).toBe('cooktool');
      expect(food?.provider_external_id).toBe('ing:6433');
      expect(food?.default_variant.calories).toBe(89);
      expect(food?.default_variant.protein).toBe(1.1);
      expect(food?.default_variant.fat).toBe(0.3);
      expect(food?.default_variant.carbs).toBe(22.8);
      expect(food?.default_variant.dietary_fiber).toBe(2.6);
      expect(food?.default_variant.potassium).toBe(358);
      expect(food?.default_variant.sodium).toBe(1);
      expect(food?.default_variant.iron).toBe(0.3);
      expect(food?.default_variant.provider_nutrients?.['Protein']).toBe(1.09);
      expect(food?.default_variant.provider_nutrient_units?.['Protein']).toBe(
        'g'
      );
      expect(
        food?.default_variant.provider_nutrient_standard?.['Protein']
      ).toBe('protein');

      // Verify cached on subsequent call
      const cached = await getCookToolDetails(ctx, 'ing:6433');
      expect(cached).toBe(food);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches branded detail and returns mapped food', async () => {
      const food = await getCookToolDetails(ctx, 'br:1994784');

      expect(food).not.toBeNull();
      expect(food?.name).toBe('CookTool Branded Product #1994784');
      expect(food?.provider_type).toBe('cooktool');
      expect(food?.default_variant.serving_size).toBe(100);
    });
  });

  describe('lookupCookToolBarcode', () => {
    it('finds product by barcode', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(brandedCheeriosFixture));

      const match = await lookupCookToolBarcode(ctx, '00016000232310');

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

      const match = await lookupCookToolBarcode(ctx, '999999999999');

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
