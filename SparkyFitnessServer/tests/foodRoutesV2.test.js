import express from 'express';
import request from 'supertest';
import foodCoreService from '../services/foodCoreService.js';
import foodRoutesV2 from '../routes/v2/foodRoutes.ts';
jest.mock('../middleware/checkPermissionMiddleware', () =>
  jest.fn(() => (req, res, next) => next())
);
jest.mock('../services/foodCoreService', () => ({
  lookupBarcode: jest.fn(),
}));
jest.mock('../services/externalProviderService', () => ({
  getExternalDataProviderDetails: jest.fn(),
}));
jest.mock('../services/preferenceService', () => ({
  getUserPreferences: jest.fn(),
}));
jest.mock('../config/logging', () => ({ log: jest.fn() }));
jest.mock('../integrations/openfoodfacts/openFoodFactsService', () => ({
  searchOpenFoodFacts: jest.fn(),
  searchOpenFoodFactsByBarcodeFields: jest.fn(),
  mapOpenFoodFactsProduct: jest.fn(),
}));
jest.mock('../integrations/usda/usdaService', () => ({
  searchUsdaFoods: jest.fn(),
  getUsdaFoodDetails: jest.fn(),
  mapUsdaBarcodeProduct: jest.fn(),
}));
jest.mock('../integrations/fatsecret/fatsecretService', () => ({
  mapFatSecretFood: jest.fn(),
  mapFatSecretSearchItem: jest.fn(),
}));
jest.mock('../services/foodIntegrationService', () => ({
  searchFatSecretFoods: jest.fn(),
  getFatSecretNutrients: jest.fn(),
  searchMealieFoods: jest.fn(),
  getMealieFoodDetails: jest.fn(),
  searchTandoorFoods: jest.fn(),
  getTandoorFoodDetails: jest.fn(),
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
    jest.clearAllMocks();
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
