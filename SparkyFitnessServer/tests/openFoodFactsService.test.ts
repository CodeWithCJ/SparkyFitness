import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
  DEFAULT_OFF_BASE_URL,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  mapOpenFoodFactsProduct,
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';

vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  resolveOpenFoodFactsProvider: vi.fn(),
  invalidateOpenFoodFactsSession: vi.fn(),
  DEFAULT_OFF_BASE_URL: 'https://world.openfoodfacts.org',
}));

global.fetch = vi.fn();

describe('openFoodFactsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    resolveOpenFoodFactsProvider.mockResolvedValue({
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
    });
  });

  describe('searchOpenFoodFacts', () => {
    it('should append the lc parameter with the specified language to the search URL', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      await searchOpenFoodFacts('pizza', 1, 'fr');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=fr'),
        expect.any(Object)
      );
    });

    it("should default to language 'en' when not specified", async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      await searchOpenFoodFacts('pizza', 1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=en'),
        expect.any(Object)
      );
    });
  });

  describe('searchOpenFoodFactsByBarcodeFields', () => {
    it('should append the lc parameter with the specified language to the product URL', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678', undefined, 'it');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=it'),
        expect.any(Object)
      );
    });

    it("should default to language 'en' when not specified", async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=en'),
        expect.any(Object)
      );
    });
  });

  describe('authenticated request path', () => {
    it('attaches a session cookie when providerId+userId are supplied', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(resolveOpenFoodFactsProvider).toHaveBeenCalledWith(
        'user-A',
        'prov-1'
      );
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const callArgs = fetch.mock.calls[0];
      expect(callArgs[1].headers).toMatchObject({
        Cookie: 'session=SESS_TOKEN',
      });
    });

    it('does not attach a cookie when no providerId is supplied', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields('12345678');

      expect(resolveOpenFoodFactsProvider).not.toHaveBeenCalled();
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Cookie).toBeUndefined();
    });

    it('on 429 with cookie, invalidates and retries unauthenticated once', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      fetch
        // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 1, product: {} }),
        });

      const result = await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(result).toEqual({ status: 1, product: {} });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
        'user-A',
        'prov-1'
      );
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[0][1].headers.Cookie).toBe('session=SESS_TOKEN');
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[1][1].headers.Cookie).toBeUndefined();
    });

    it('on 503 with cookie, retries unauthenticated and returns final response', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      fetch
        // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('unavailable'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ products: [], count: 0 }),
        });

      await searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalled();
    });

    it('does not retry on 429 when no cookie was attached', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });

      await expect(
        searchOpenFoodFactsByBarcodeFields('12345678')
      ).rejects.toThrow('OpenFoodFacts API error');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('self-hosted base_url resolution', () => {
    it('builds the search URL from a resolved custom base_url', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/sparkyfitness-foodfacts:8080\/cgi\/search\.pl/
        ),
        expect.any(Object)
      );
    });

    it('builds the barcode URL from a resolved custom base_url', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/sparkyfitness-foodfacts:8080\/api\/v2\/product\/12345678\.json/
        ),
        expect.any(Object)
      );
    });

    it('falls back to the public default URL when no provider/base_url is configured', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'en');

      expect(resolveOpenFoodFactsProvider).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_OFF_BASE_URL),
        expect.any(Object)
      );
    });
  });

  describe('mapOpenFoodFactsProduct', () => {
    const baseProduct = {
      product_name: 'Test Bread',
      brands: 'TestBrand',
      code: '1234567890123',
      serving_quantity: 50,
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_100g: 8,
        carbohydrates_100g: 45,
        fat_100g: 3,
      },
    };

    it('extracts and normalizes allergens_tags and traces_tags', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['en:gluten', 'en:milk', 'en:eggs'],
        traces_tags: ['en:nuts', 'en:sesame'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual([
        'gluten',
        'milk',
        'eggs',
      ]);
      expect(result.default_variant.traces).toEqual(['nuts', 'sesame']);
    });

    it('strips non-english language prefixes', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['fr:gluten', 'de:milch'],
        traces_tags: ['es:nueces'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual(['gluten', 'milch']);
      expect(result.default_variant.traces).toEqual(['nueces']);
    });

    it('returns null for allergens and traces when tags are absent', () => {
      const result = mapOpenFoodFactsProduct(baseProduct);
      expect(result.default_variant.allergens).toBeNull();
      expect(result.default_variant.traces).toBeNull();
    });

    it('returns null when tags are empty arrays', () => {
      const product = {
        ...baseProduct,
        allergens_tags: [],
        traces_tags: [],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toBeNull();
      expect(result.default_variant.traces).toBeNull();
    });

    it('handles allergens present but traces absent', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['en:soy'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual(['soy']);
      expect(result.default_variant.traces).toBeNull();
    });
  });

  describe('mapOpenFoodFactsProduct serving unit derivation', () => {
    const solidBaseProduct = {
      product_name: 'Test Bread',
      brands: 'TestBrand',
      code: '1234567890123',
      serving_quantity: 50,
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_100g: 8,
        carbohydrates_100g: 45,
        fat_100g: 3,
      },
    };

    // Real shape returned by world.openfoodfacts.org for Coca-Cola
    // (barcode 5449000000996), verified against the live API.
    const cocaColaProduct = {
      product_name: 'Coca-Cola',
      brands: 'Coca-Cola',
      code: '5449000000996',
      serving_size: '1 portion (330 ml)',
      serving_quantity: 330,
      serving_quantity_unit: 'ml',
      product_quantity_unit: 'ml',
      nutrition_data_per: '100g', // deliberately misleading; must be ignored
      nutriments: {
        'energy-kcal_100g': 42,
        proteins_100g: 0,
        carbohydrates_100g: 10.6,
        fat_100g: 0,
      },
    };

    it('uses serving_quantity_unit for a beverage, keeping nutrient values unconverted', () => {
      const result = mapOpenFoodFactsProduct(cocaColaProduct);
      expect(result.default_variant.serving_unit).toBe('ml');
      expect(result.default_variant.serving_size).toBe(330);
      // 42 kcal/100 * 330 = 138.6 -> rounds to 139, matching OFF's own
      // energy-kcal_serving value for this product.
      expect(result.default_variant.calories).toBe(139);
    });

    it('falls back to product_quantity_unit when serving_quantity_unit is absent', () => {
      const { serving_quantity_unit: _omit, ...rest } = cocaColaProduct;
      const result = mapOpenFoodFactsProduct(rest);
      expect(result.default_variant.serving_unit).toBe('ml');
    });

    it('falls back to parsing serving_size text when no unit field is present', () => {
      const {
        serving_quantity_unit: _omit1,
        product_quantity_unit: _omit2,
        ...rest
      } = cocaColaProduct;
      const result = mapOpenFoodFactsProduct(rest);
      expect(result.default_variant.serving_unit).toBe('ml');
    });

    it('defaults to g for a solid product with no unit signal (regression guard)', () => {
      const result = mapOpenFoodFactsProduct(solidBaseProduct);
      expect(result.default_variant.serving_unit).toBe('g');
    });

    it('ignores nutrition_data_per even though it says "100g" for a liquid', () => {
      // Guards against reintroducing nutrition_data_per as a signal: OFF sets
      // it to "100g" on this real beverage, so trusting it would regress the
      // exact bug being fixed here.
      const result = mapOpenFoodFactsProduct(cocaColaProduct);
      expect(result.default_variant.serving_unit).not.toBe('g');
    });

    it('respects an explicit g unit for a solid product', () => {
      const solidProduct = {
        ...solidBaseProduct,
        serving_quantity_unit: 'g',
        product_quantity_unit: 'g',
      };
      const result = mapOpenFoodFactsProduct(solidProduct);
      expect(result.default_variant.serving_unit).toBe('g');
    });
  });
});
