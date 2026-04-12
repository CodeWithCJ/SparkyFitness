import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import foodCoreService from '../services/foodCoreService.js';
import foodRoutesV2 from '../routes/v2/foodRoutes.ts';
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (req, res, next) => next()),
}));

vi.mock('../services/foodCoreService.js', () => ({
  default: {
    lookupBarcode: vi.fn(),
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
app.use((err, req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message });
});
describe('GET /v2/foods/barcode/:barcode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('returns a local barcode hit when optional fields are null', async () => {
    const barcode = '012345678901';
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
