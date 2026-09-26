import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import foodService from '../services/foodService.js';
import preferenceService from '../services/preferenceService.js';
import externalProviderService from '../services/externalProviderService.js';
import {
  fetchProviderFoodDetails,
  enrichWithCustomNutrients,
} from '../services/foodProviderDetailService.js';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/foodService.js', () => ({
  default: { getFoodById: vi.fn() },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getExternalDataProvidersForUser: vi.fn() },
}));
vi.mock('../services/foodProviderDetailService.js', () => ({
  fetchProviderFoodDetails: vi.fn(),
  enrichWithCustomNutrients: vi.fn(),
  normalizeFoodForResponse: vi.fn((food: unknown) => food),
}));

const app = express();
app.use(express.json());
app.use('/foods', foodCrudRoutes);

const refreshedFood = {
  id: 'fresh-1',
  name: 'Whey Protein',
  brand: 'Optimum',
  barcode: '1234567890123',
  provider_type: 'usda',
  provider_external_id: 'ext-1',
  is_custom: true,
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 390,
    protein: 25,
    carbs: 4,
    fat: 4,
    sodium: 90,
    is_default: true,
  },
};

const usdaFood = {
  id: 'food-1',
  name: 'Whey Protein (stale)',
  brand: 'Optimum',
  user_id: 'user-123',
  provider_type: 'usda',
  provider_external_id: 'ext-1',
};

describe('POST /foods/:id/refresh-from-source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodService.getFoodById).mockResolvedValue(usdaFood);
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      language: 'de',
    });
    vi.mocked(
      externalProviderService.getExternalDataProvidersForUser
    ).mockResolvedValue([
      { id: 'prov-1', provider_type: 'usda', is_active: true },
    ]);
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue(refreshedFood);
    vi.mocked(enrichWithCustomNutrients).mockResolvedValue(undefined);
  });

  it('resolves the active provider row by type and returns normalized food', async () => {
    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(200);
    expect(res.body.food.name).toBe('Whey Protein');
    expect(fetchProviderFoodDetails).toHaveBeenCalledWith({
      credentialUserId: 'user-123',
      dataUserId: 'user-123',
      providerType: 'usda',
      externalId: 'ext-1',
      providerId: 'prov-1',
      language: 'de',
    });
    expect(enrichWithCustomNutrients).toHaveBeenCalledWith('user-123', [
      refreshedFood,
    ]);
  });

  it('responds 404 when the food is invisible to the data context', async () => {
    vi.mocked(foodService.getFoodById).mockResolvedValue(null);

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Food not found.');
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
  });

  it('responds 404 when the food has no external source', async () => {
    vi.mocked(foodService.getFoodById).mockResolvedValue({
      ...usdaFood,
      provider_type: null,
      provider_external_id: null,
    });

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Food not found.');
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
  });

  it('responds 403 when the food is owned by another user', async () => {
    vi.mocked(foodService.getFoodById).mockResolvedValue({
      ...usdaFood,
      user_id: 'other-user',
    });

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden: You do not own this food.');
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
  });

  it('responds 400 when no active provider of that type is configured', async () => {
    vi.mocked(
      externalProviderService.getExternalDataProvidersForUser
    ).mockResolvedValue([]);

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active usda provider is configured.');
    expect(fetchProviderFoodDetails).not.toHaveBeenCalled();
  });

  it('skips the provider-row requirement for Open Food Facts foods', async () => {
    vi.mocked(foodService.getFoodById).mockResolvedValue({
      ...usdaFood,
      provider_type: 'openfoodfacts',
    });
    vi.mocked(
      externalProviderService.getExternalDataProvidersForUser
    ).mockResolvedValue([]);

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(200);
    expect(fetchProviderFoodDetails).toHaveBeenCalledWith({
      credentialUserId: 'user-123',
      dataUserId: 'user-123',
      providerType: 'openfoodfacts',
      externalId: 'ext-1',
      providerId: undefined,
      language: 'de',
    });
  });

  it('responds 404 when the source no longer has the food', async () => {
    vi.mocked(fetchProviderFoodDetails).mockResolvedValue(null);

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Food not found at source.');
    expect(enrichWithCustomNutrients).not.toHaveBeenCalled();
  });

  it('surfaces provider fetch errors carrying an HTTP status', async () => {
    vi.mocked(fetchProviderFoodDetails).mockRejectedValue(
      Object.assign(new Error('Upstream is down'), { status: 502 })
    );

    const res = await request(app).post('/foods/food-1/refresh-from-source');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Upstream is down');
  });
});
