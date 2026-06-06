import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YAZIO_OAUTH_CONFIG_ERROR,
  getYazioFoodDetails,
  mapYazioProduct,
  resolveYazioCredentials,
  searchYazioFoods,
  searchYazioByBarcode,
} from '../integrations/yazio/yazioService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const originalFetch = global.fetch;
const yazioClientCredentials = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

const makeFetchResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Gateway',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as Response;

describe('yazioService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not treat packed YAZIO JSON with blank login fields as raw credentials', () => {
    const resolved = resolveYazioCredentials({
      username: JSON.stringify({ username: '', clientId: 'client-id' }),
      password: JSON.stringify({ password: '', clientSecret: 'client-secret' }),
    });

    expect(resolved).toMatchObject({
      username: undefined,
      password: undefined,
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
  });

  it('maps YAZIO product nutrition into Sparky food shape', () => {
    const result = mapYazioProduct({
      id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      name: 'Protein Joghurt',
      producer: 'Test Brand',
      serving_quantity: 1,
      amount: 20,
      base_unit: 'GRAM',
      eans: ['4001234567890'],
      nutrients: {
        'energy.energy': 0.64,
        'nutrient.protein': 0.152,
        'nutrient.carb': 0.084,
        'nutrient.fat': 0.021,
        'nutrient.dietaryfiber': 0.004,
        'nutrient.sugar': 0.079,
        'nutrient.saturated': 0.01,
        'nutrient.sodium': 0.0004,
        'mineral.potassium': 0.0018,
        'mineral.calcium': 0.0012,
        'mineral.iron': 0.000002,
        'vitamin.a': 0.0000002,
        'vitamin.c': 0.000001,
      },
    });

    expect(result).toEqual({
      name: 'Protein Joghurt',
      brand: 'Test Brand',
      barcode: '4001234567890',
      provider_external_id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      provider_type: 'yazio',
      provider_verified: false,
      is_custom: false,
      default_variant: {
        serving_size: 100,
        serving_unit: 'g',
        serving_description: '100 g',
        serving_weight: 100,
        serving_weight_unit: 'g',
        calories: 64,
        protein: 15.2,
        carbs: 8.4,
        fat: 2.1,
        saturated_fat: 1,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        dietary_fiber: 0.4,
        sugars: 7.9,
        sodium: 40,
        potassium: 180,
        calcium: 120,
        iron: 0.2,
        vitamin_a: 20,
        vitamin_c: 0.1,
        is_default: true,
      },
      variants: [
        {
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
          serving_weight: 100,
          serving_weight_unit: 'g',
          calories: 64,
          protein: 15.2,
          carbs: 8.4,
          fat: 2.1,
          saturated_fat: 1,
          polyunsaturated_fat: 0,
          monounsaturated_fat: 0,
          trans_fat: 0,
          cholesterol: 0,
          dietary_fiber: 0.4,
          sugars: 7.9,
          sodium: 40,
          potassium: 180,
          calcium: 120,
          iron: 0.2,
          vitamin_a: 20,
          vitamin_c: 0.1,
          is_default: true,
        },
      ],
    });
  });

  it('scales live YAZIO nutrient densities to per-100g nutrition', () => {
    const result = mapYazioProduct({
      id: '92c33e76-8d5c-4da0-8283-828f9a79667a',
      name: 'Skyr Natur',
      is_verified: true,
      serving: 'tablespoon',
      serving_quantity: 1,
      amount: 20,
      base_unit: 'g',
      nutrients: {
        'energy.energy': 0.63,
        'nutrient.carb': 0.04,
        'nutrient.fat': 0.002,
        'nutrient.protein': 0.106,
      },
    });

    expect(result?.provider_verified).toBe(true);
    expect(result?.default_variant).toMatchObject({
      serving_size: 100,
      serving_unit: 'g',
      calories: 63,
      protein: 10.6,
      carbs: 4,
      fat: 0.2,
    });
  });

  it('maps YAZIO kiwi portion servings while preserving the per-100g default', () => {
    const result = mapYazioProduct({
      id: 'kiwi-frisch',
      name: 'Kiwi, frisch',
      is_verified: true,
      base_unit: 'g',
      servings: [
        { serving: 'Frucht, halb', amount: 45 },
        { serving: 'Frucht, klein', amount: 70 },
        { serving: 'Frucht, mittel', amount: 90 },
        { serving: 'Frucht, groß', amount: 115 },
        { serving: 'Gramm', amount: 1 },
      ],
      nutrients: {
        'energy.energy': 0.62,
        'nutrient.carb': 0.091,
        'nutrient.protein': 0.01,
        'nutrient.fat': 0.006,
      },
    });

    expect(result?.provider_verified).toBe(true);
    expect(result?.default_variant).toMatchObject({
      serving_size: 100,
      serving_unit: 'g',
      serving_description: '100 g',
      serving_weight: 100,
      serving_weight_unit: 'g',
      calories: 62,
      carbs: 9.1,
      protein: 1,
      fat: 0.6,
      is_default: true,
    });

    const smallKiwi = result?.variants?.find(
      (variant) => variant.serving_unit === 'Frucht, klein'
    );
    expect(smallKiwi).toMatchObject({
      serving_size: 1,
      serving_unit: 'Frucht, klein',
      serving_description: 'Frucht, klein (70 g)',
      serving_weight: 70,
      serving_weight_unit: 'g',
      calories: 43,
      carbs: 6.4,
      protein: 0.7,
      fat: 0.4,
      is_default: false,
    });

    expect(
      result?.variants?.map((variant) => variant.serving_description)
    ).toEqual([
      '100 g',
      'Frucht, halb (45 g)',
      'Frucht, klein (70 g)',
      'Frucht, mittel (90 g)',
      'Frucht, groß (115 g)',
      '1 g',
    ]);
  });

  it('returns null for empty product payloads', () => {
    expect(mapYazioProduct(null)).toBeNull();
    expect(mapYazioProduct(undefined)).toBeNull();
  });

  it('keeps non-density portion variant nutrients finite', () => {
    const result = mapYazioProduct({
      id: 'portion-scaling',
      name: 'Portion Scaling',
      serving_quantity: 1,
      base_unit: 'piece',
      servings: [{ serving: 'piece', amount: 1 }],
      nutrients: {
        'energy.energy': 250,
        'nutrient.carb': 20,
        'nutrient.protein': 10,
        'nutrient.fat': 5,
      },
    });

    expect(result?.variants[1]).toMatchObject({
      serving_size: 1,
      serving_unit: 'piece',
      calories: 250,
      carbs: 20,
      protein: 10,
      fat: 5,
    });
    expect(Number.isFinite(result?.variants[1]?.calories ?? Number.NaN)).toBe(
      true
    );
  });

  it('authenticates and searches products with pagination', async () => {
    const product = {
      product_id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      name: 'Skyr Natur',
      producer: 'Molkerei',
      serving_quantity: 100,
      base_unit: 'g',
      nutrients: {
        'energy.energy': 0.64,
        'nutrient.protein': 0.11,
        'nutrient.carb': 0.04,
        'nutrient.fat': 0.002,
      },
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-1', expires_in: 3600 })
      )
      .mockResolvedValueOnce(makeFetchResponse([product, product]));

    const result = await searchYazioFoods('skyr', {
      username: 'user@example.com',
      password: 'secret',
      ...yazioClientCredentials,
      page: 1,
      pageSize: 1,
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://yzapi.yazio.com/v18/oauth/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"client_id":"test-client-id"'),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://yzapi.yazio.com/v18/products/search?'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      })
    );
    expect(result.foods).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalCount: 2,
      hasMore: true,
    });
  });

  it('deduplicates concurrent token requests for the same YAZIO account', async () => {
    const product = {
      product_id: 'concurrent-product',
      name: 'Concurrent Product',
      serving_quantity: 100,
      base_unit: 'g',
      nutrients: { 'energy.energy': 1 },
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'shared-token', expires_in: 3600 })
      )
      .mockResolvedValueOnce(makeFetchResponse([product]))
      .mockResolvedValueOnce(makeFetchResponse([product]));

    await Promise.all([
      searchYazioFoods('apple', {
        username: 'concurrent@example.com',
        password: 'secret',
        ...yazioClientCredentials,
      }),
      searchYazioFoods('banana', {
        username: 'concurrent@example.com',
        password: 'secret',
        ...yazioClientCredentials,
      }),
    ]);

    const tokenCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => String(url).includes('/oauth/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('treats unexpected YAZIO search payloads as empty results', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-non-array', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({ error: 'unexpected payload' })
      );

    const result = await searchYazioFoods('skyr', {
      username: 'non-array@example.com',
      password: 'secret',
      ...yazioClientCredentials,
    });

    expect(result).toEqual({
      foods: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 0,
        hasMore: false,
      },
    });
  });

  it('fetches product details by id', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-2', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: 'Hafer Drink',
          is_verified: true,
          producer: null,
          base_unit: 'ml',
          servings: [{ serving: 'ml', amount: 100 }],
          nutrients: {
            'energy.energy': 0.46,
            'nutrient.protein': 0.01,
            'nutrient.carb': 0.066,
            'nutrient.fat': 0.015,
          },
          eans: ['4311501683902'],
        })
      );

    const result = await getYazioFoodDetails(
      '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      {
        username: 'other@example.com',
        password: 'secret',
        ...yazioClientCredentials,
      }
    );

    expect(result?.name).toBe('Hafer Drink');
    expect(result?.provider_external_id).toBe(
      '7c91b431-a2b5-4f11-8f52-f346dc941f2a'
    );
    expect(result?.provider_verified).toBe(true);
    expect(result?.default_variant).toMatchObject({
      serving_size: 100,
      serving_unit: 'ml',
      calories: 46,
      protein: 1,
      carbs: 6.6,
      fat: 1.5,
    });
    expect(result?.default_variant.serving_unit).toBe('ml');
    expect(result?.barcode).toBe('4311501683902');
  });

  it('hydrates barcode search candidates and returns a detail EAN match', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-3', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse([
          {
            product_id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
            name: 'Barcode Product',
            producer: 'Brand',
            serving_quantity: 100,
            base_unit: 'g',
          },
        ])
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: 'Barcode Product',
          producer: 'Brand',
          serving_quantity: 100,
          base_unit: 'g',
          servings: [{ serving: 'g', amount: 100 }],
          eans: ['0094395000172'],
          nutrients: {
            'energy.energy': 1,
            'nutrient.protein': 0.01,
            'nutrient.carb': 0.02,
            'nutrient.fat': 0.03,
          },
        })
      );

    const result = await searchYazioByBarcode('094395000172', {
      username: 'barcode-detail@example.com',
      password: 'secret',
      ...yazioClientCredentials,
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'https://yzapi.yazio.com/v18/products/7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-3',
        }),
      })
    );
    expect(result?.provider_external_id).toBe(
      '7c91b431-a2b5-4f11-8f52-f346dc941f2a'
    );
    expect(result?.barcode).toBe('0094395000172');
  });

  it('skips non-matching detail EANs and returns null when no candidate matches', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-4', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse([
          {
            product_id: 'non-matching-product',
            name: 'Wrong Product',
            serving_quantity: 100,
            base_unit: 'g',
          },
          {
            product_id: 'missing-ean-product',
            name: 'Missing EAN Product',
            serving_quantity: 100,
            base_unit: 'g',
          },
        ])
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: 'Wrong Product',
          serving_quantity: 100,
          base_unit: 'g',
          eans: ['1234567890123'],
          nutrients: {
            'energy.energy': 1,
          },
        })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: 'Missing EAN Product',
          serving_quantity: 100,
          base_unit: 'g',
          eans: [],
          nutrients: {
            'energy.energy': 1,
          },
        })
      );

    const result = await searchYazioByBarcode('4008400401621', {
      username: 'barcode-no-match@example.com',
      password: 'secret',
      ...yazioClientCredentials,
    });

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('continues hydrating barcode candidates when a detail fetch fails', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-5', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse([
          {
            product_id: 'failing-product',
            name: 'Failing Product',
            serving_quantity: 100,
            base_unit: 'g',
          },
          {
            product_id: 'matching-product',
            name: 'Matching Product',
            serving_quantity: 100,
            base_unit: 'g',
          },
        ])
      )
      .mockResolvedValueOnce(
        makeFetchResponse({ error: 'upstream' }, false, 500)
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          name: 'Matching Product',
          serving_quantity: 100,
          base_unit: 'g',
          eans: ['0094395000172'],
          nutrients: {
            'energy.energy': 1,
            'nutrient.protein': 0.01,
            'nutrient.carb': 0.02,
            'nutrient.fat': 0.03,
          },
        })
      );

    const result = await searchYazioByBarcode('094395000172', {
      username: 'barcode-detail-failure@example.com',
      password: 'secret',
      ...yazioClientCredentials,
    });

    expect(result?.provider_external_id).toBe('matching-product');
  });

  it('fails gracefully when provider OAuth client credentials are missing', async () => {
    await expect(
      searchYazioFoods('skyr', {
        username: 'missing-config@example.com',
        password: 'secret',
      })
    ).rejects.toMatchObject({
      message: YAZIO_OAUTH_CONFIG_ERROR,
      status: 503,
      statusCode: 503,
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
