import express, { type ErrorRequestHandler } from 'express';
// @ts-expect-error supertest does not provide declarations in this workspace
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import routes from '../routes/v2/barcodeRoutes.js';
import * as service from '../services/barcodeLookupService.js';
import customNutrientService from '../services/customNutrientService.js';
vi.mock('../services/customNutrientService.js', () => ({
  default: { getCustomNutrients: vi.fn() },
}));
vi.mock('../services/barcodeLookupService.js');
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.userId = 'target';
  req.authenticatedUserId = 'actor';
  next();
});
app.use(routes);
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const status =
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : 500;
  res.status(status).json({ error: 'Request failed' });
};
app.use(errors);
const providerId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.resetAllMocks());
describe('barcode source routes', () => {
  it('enriches alternative source imports with the same personal nutrient aliases as initial results', async () => {
    vi.mocked(customNutrientService.getCustomNutrients).mockResolvedValue([
      { name: 'My magnesium', aliases: ['Magnesium'], unit: 'mg' },
    ]);
    vi.mocked(service.getBarcodeAlternatives).mockResolvedValue({
      results: [
        {
          providerId,
          providerName: 'Source',
          source: 'usda',
          status: 'found',
          food: {
            name: 'Product',
            brand: null,
            is_custom: false,
            default_variant: {
              serving_size: 100,
              serving_unit: 'g',
              calories: 100,
              protein: 3,
              carbs: 20,
              fat: 2,
              is_default: true,
              provider_nutrients: { Magnesium: 42 },
              provider_nutrient_units: { Magnesium: 'mg' },
            },
          },
        },
      ],
    });
    const response = await request(app)
      .get('/barcode/1234567890123/alternatives')
      .expect(200);
    expect(
      response.body.results[0].food.default_variant.custom_nutrients
    ).toEqual({ 'My magnesium': 42 });
    expect(customNutrientService.getCustomNutrients).toHaveBeenCalledWith(
      'target'
    );
  });
  it('checks barcode shape before collecting alternatives', async () => {
    await request(app).get('/barcode/not-a-code/alternatives').expect(400);
    expect(service.getBarcodeAlternatives).not.toHaveBeenCalled();
  });
  it('keeps active profile food visibility separate from actor credentials', async () => {
    vi.mocked(service.getBarcodeAlternatives).mockResolvedValue({
      results: [],
    });
    await request(app).get('/barcode/1234567890123/alternatives').expect(200);
    expect(service.getBarcodeAlternatives).toHaveBeenCalledWith(
      '1234567890123',
      'target',
      'actor'
    );
  });
});
