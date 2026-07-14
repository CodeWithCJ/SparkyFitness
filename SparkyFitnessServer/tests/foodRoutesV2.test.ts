import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import foodCoreService from '../services/foodCoreService.js';
import customNutrientService from '../services/customNutrientService.js';
import { searchProviderFoods } from '../services/externalFoodSearchService.js';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import foodRoutesV2 from '../routes/v2/foodRoutes.js';
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../services/externalFoodSearchService.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../services/externalFoodSearchService.js')
    >();
  return {
    ...actual,
    searchProviderFoods: vi.fn(),
  };
});

vi.mock('../services/foodCoreService.js', () => ({
  default: {
    lookupBarcode: vi.fn(),
  },
}));

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/externalProviderService.js', () => ({
  default: {
    getExternalDataProviderDetails: vi.fn(),
  },
}));

vi.mock('../services/preferenceService.js', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

// Falls log ein benannter Export ist (import { log }), bleibt es so:
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('../integrations/openfoodfacts/openFoodFactsService.js', () => ({
  default: {
    searchOpenFoodFacts: vi.fn(),
    searchOpenFoodFactsByBarcodeFields: vi.fn(),
    mapOpenFoodFactsProduct: vi.fn(),
  },
}));

vi.mock('../integrations/usda/usdaService.js', () => ({
  default: {
    searchUsdaFoods: vi.fn(),
    getUsdaFoodDetails: vi.fn(),
    mapUsdaBarcodeProduct: vi.fn(),
  },
}));

vi.mock('../integrations/fatsecret/fatsecretService.js', () => ({
  default: {
    mapFatSecretFood: vi.fn(),
    mapFatSecretSearchItem: vi.fn(),
  },
}));

vi.mock('../services/foodIntegrationService.js', () => ({
  default: {
    searchFatSecretFoods: vi.fn(),
    getFatSecretNutrients: vi.fn(),
    searchMealieFoods: vi.fn(),
    getMealieFoodDetails: vi.fn(),
    searchTandoorFoods: vi.fn(),
    getTandoorFoodDetails: vi.fn(),
  },
}));
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.userId = 'user-123';

  req.authenticatedUserId = 'user-123';
  next();
});
app.use('/v2/foods', foodRoutesV2);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});
describe('GET /v2/foods/barcode/:barcode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('returns a local barcode hit when optional fields are null', async () => {
    const barcode = '012345678901';
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodCoreService.lookupBarcode.mockResolvedValue({
      source: 'local',
      food: {
        id: 'food-abc-123',
        name: 'Manual Granola',
        brand: null,
        barcode: null,
        provider_external_id: null,
        provider_type: null,
        is_custom: true,
        default_variant: {
          id: 'variant-xyz-789',
          serving_size: 100,
          serving_unit: 'g',
          calories: 420,
          protein: 12,
          carbs: 61,
          fat: 14,
          saturated_fat: null,
          polyunsaturated_fat: null,
          monounsaturated_fat: null,
          trans_fat: null,
          cholesterol: null,
          sodium: null,
          potassium: null,
          dietary_fiber: null,
          sugars: null,
          vitamin_a: null,
          vitamin_c: null,
          calcium: null,
          iron: null,
          is_default: true,
          glycemic_index: null,
          custom_nutrients: null,
        },
        variants: null,
      },
    });
    const res = await request(app).get(`/v2/foods/barcode/${barcode}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      source: 'local',
      food: {
        id: 'food-abc-123',
        name: 'Manual Granola',
        brand: null,
        barcode,
        is_custom: true,
        default_variant: {
          id: 'variant-xyz-789',
          serving_size: 100,
          serving_unit: 'g',
          calories: 420,
          protein: 12,
          carbs: 61,
          fat: 14,
          is_default: true,
        },
      },
    });
    expect(res.body.food).not.toHaveProperty('provider_external_id');
    expect(res.body.food).not.toHaveProperty('provider_type');
    expect(res.body.food).not.toHaveProperty('variants');
    expect(res.body.food.default_variant).not.toHaveProperty('saturated_fat');
    expect(res.body.food.default_variant).not.toHaveProperty(
      'custom_nutrients'
    );
  });
});

describe('GET /v2/foods/search/:providerType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to searchProviderFoods and normalizes the result', async () => {
    vi.mocked(searchProviderFoods).mockResolvedValue({
      foods: [
        {
          id: 'food-off-1',
          name: 'Oat Milk',
          brand: null,
          barcode: null,
          provider_external_id: 'off-123',
          provider_type: 'openfoodfacts',
          is_custom: false,
          default_variant: {
            id: null,
            serving_size: 100,
            serving_unit: 'ml',
            calories: 45,
            protein: 1,
            carbs: 7,
            fat: 1.5,
            saturated_fat: null,
            is_default: true,
            custom_nutrients: null,
          },
          variants: null,
        },
      ],
      pagination: { page: 2, pageSize: 10, totalCount: 25, hasMore: true },
    });

    const res = await request(app).get(
      '/v2/foods/search/openfoodfacts?query=oat%20milk&page=2&pageSize=10&autoScale=false'
    );

    expect(res.statusCode).toBe(200);
    expect(searchProviderFoods).toHaveBeenCalledWith(
      'user-123',
      'openfoodfacts',
      'oat milk',
      { page: 2, pageSize: 10, providerId: undefined, autoScale: false },
      'user-123'
    );
    expect(res.body).toEqual({
      foods: [
        {
          id: 'food-off-1',
          name: 'Oat Milk',
          brand: null,
          provider_external_id: 'off-123',
          provider_type: 'openfoodfacts',
          is_custom: false,
          default_variant: {
            serving_size: 100,
            serving_unit: 'ml',
            calories: 45,
            protein: 1,
            carbs: 7,
            fat: 1.5,
            is_default: true,
          },
        },
      ],
      pagination: { page: 2, pageSize: 10, totalCount: 25, hasMore: true },
    });
    expect(res.body.foods[0]).not.toHaveProperty('barcode');
    expect(res.body.foods[0].default_variant).not.toHaveProperty(
      'saturated_fat'
    );
  });

  it('matches provider_nutrients into custom_nutrients and surfaces provider_nutrients', async () => {
    vi.mocked(customNutrientService.getCustomNutrients).mockResolvedValueOnce([
      { name: 'Magnesium', aliases: ['Magnesium, Mg'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    vi.mocked(searchProviderFoods).mockResolvedValue({
      foods: [
        {
          id: null,
          name: 'Fish, salmon, smoked',
          brand: null,
          barcode: null,
          provider_external_id: 'usda-2706292',
          provider_type: 'usda',
          is_custom: false,
          default_variant: {
            id: null,
            serving_size: 100,
            serving_unit: 'g',
            calories: 117,
            protein: 18.3,
            carbs: 0,
            fat: 4.3,
            is_default: true,
            custom_nutrients: null,
            provider_nutrients: { 'Magnesium, Mg': 18, Sodium: 600 },
          },
          variants: null,
        },
      ],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    const res = await request(app).get('/v2/foods/search/usda?query=salmon');

    expect(res.statusCode).toBe(200);
    const variant = res.body.foods[0].default_variant;
    expect(variant.custom_nutrients).toEqual({ Magnesium: 18 });
    // The full provider field list survives to the client for the alias viewer.
    expect(variant.provider_nutrients).toEqual({
      'Magnesium, Mg': 18,
      Sodium: 600,
    });
  });

  it('rejects an invalid provider type without calling the service', async () => {
    const res = await request(app).get('/v2/foods/search/bogus?query=apple');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid provider type: bogus' });
    expect(searchProviderFoods).not.toHaveBeenCalled();
  });

  it('rejects a missing query without calling the service', async () => {
    const res = await request(app).get('/v2/foods/search/usda');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing query parameter' });
    expect(searchProviderFoods).not.toHaveBeenCalled();
  });

  it('maps status-tagged service errors to HTTP status codes', async () => {
    vi.mocked(searchProviderFoods).mockRejectedValue(
      Object.assign(new Error('Missing providerId query parameter'), {
        status: 400,
      })
    );

    const res = await request(app).get('/v2/foods/search/usda?query=apple');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing providerId query parameter' });
  });
});
