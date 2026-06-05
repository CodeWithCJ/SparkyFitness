import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getYazioFoodDetails,
  mapYazioProduct,
  searchYazioFoods,
  searchYazioByBarcode,
} from '../integrations/yazio/yazioService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const originalFetch = global.fetch;

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

  it('maps YAZIO product nutrition into Sparky food shape', () => {
    const result = mapYazioProduct({
      id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      name: 'Protein Joghurt',
      producer: 'Test Brand',
      serving_quantity: 150,
      base_unit: 'GRAM',
      eans: ['4001234567890'],
      nutrients: {
        'energy.energy': 120,
        'nutrient.protein': 15.2,
        'nutrient.carb': 8.4,
        'nutrient.fat': 2.1,
        'nutrient.dietaryfiber': 0.4,
        'nutrient.sugar': 7.9,
        'mineral.potassium': 180,
        'mineral.calcium': 120,
        'mineral.iron': 0.2,
      },
    });

    expect(result).toEqual({
      name: 'Protein Joghurt',
      brand: 'Test Brand',
      barcode: '4001234567890',
      provider_external_id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      provider_type: 'yazio',
      is_custom: false,
      default_variant: {
        serving_size: 150,
        serving_unit: 'g',
        calories: 120,
        protein: 15.2,
        carbs: 8.4,
        fat: 2.1,
        dietary_fiber: 0.4,
        sugars: 7.9,
        sodium: 0,
        potassium: 180,
        calcium: 120,
        iron: 0.2,
        vitamin_a: 0,
        vitamin_c: 0,
        is_default: true,
      },
    });
  });

  it('authenticates and searches products with pagination', async () => {
    const product = {
      product_id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      name: 'Skyr Natur',
      producer: 'Molkerei',
      serving_quantity: 100,
      base_unit: 'g',
      nutrients: {
        'energy.energy': 64,
        'nutrient.protein': 11,
        'nutrient.carb': 4,
        'nutrient.fat': 0.2,
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
      page: 1,
      pageSize: 1,
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://yzapi.yazio.com/v15/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://yzapi.yazio.com/v15/products/search?'),
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

  it('fetches product details by id', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        makeFetchResponse({ access_token: 'token-2', expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          id: '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
          name: 'Hafer Drink',
          producer: null,
          servings: [{ serving: 'ml', amount: 100 }],
          nutrients: {
            'energy.energy': 46,
            'nutrient.protein': 1,
            'nutrient.carb': 6.6,
            'nutrient.fat': 1.5,
          },
          eans: ['4311501683902'],
        })
      );

    const result = await getYazioFoodDetails(
      '7c91b431-a2b5-4f11-8f52-f346dc941f2a',
      {
        username: 'other@example.com',
        password: 'secret',
      }
    );

    expect(result?.name).toBe('Hafer Drink');
    expect(result?.default_variant.serving_unit).toBe('ml');
    expect(result?.barcode).toBe('4311501683902');
  });

  it('returns a barcode match only when the normalized EAN matches', async () => {
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
            eans: ['0094395000172'],
            nutrients: {
              'energy.energy': 100,
              'nutrient.protein': 1,
              'nutrient.carb': 2,
              'nutrient.fat': 3,
            },
          },
        ])
      );

    const result = await searchYazioByBarcode('094395000172', {
      username: 'barcode@example.com',
      password: 'secret',
    });

    expect(result?.provider_external_id).toBe(
      '7c91b431-a2b5-4f11-8f52-f346dc941f2a'
    );
  });
});
