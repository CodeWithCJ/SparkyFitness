import { vi, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';
import foodService from '../services/foodService.js';
vi.mock('../services/foodService.js', () => ({
  default: {
    lookupBarcode: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (req, res, next) => next()),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));
const app = express();
app.use(express.json());
app.use('/food-crud', foodCrudRoutes);
// Error handler so 500s return JSON instead of HTML
app.use((err, req, res, _next) => {
  res.status(500).json({ error: err.message });
});
describe('GET /food-crud/barcode/:barcode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should return 400 for barcode with letters', async () => {
    const res = await request(app).get('/food-crud/barcode/abc12345');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid barcode format/);
    expect(foodService.lookupBarcode).not.toHaveBeenCalled();
  });
  it('should return 400 for barcode shorter than 8 digits', async () => {
    const res = await request(app).get('/food-crud/barcode/1234567');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid barcode format/);
  });
  it('should return 400 for barcode longer than 14 digits', async () => {
    const res = await request(app).get('/food-crud/barcode/123456789012345');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid barcode format/);
  });
  it('should accept an 8-digit barcode', async () => {
    foodService.lookupBarcode.mockResolvedValue({
      source: 'not_found',
      food: null,
    });
    const res = await request(app).get('/food-crud/barcode/12345678');
    expect(res.statusCode).toBe(200);
    expect(foodService.lookupBarcode).toHaveBeenCalledWith(
      '12345678',
      'user-123',
      undefined
    );
  });
  it('should accept a 14-digit barcode', async () => {
    foodService.lookupBarcode.mockResolvedValue({
      source: 'not_found',
      food: null,
    });
    const res = await request(app).get('/food-crud/barcode/12345678901234');
    expect(res.statusCode).toBe(200);
    expect(foodService.lookupBarcode).toHaveBeenCalledWith(
      '12345678901234',
      'user-123',
      undefined
    );
  });
  it('should return local food result', async () => {
    const localResult = {
      source: 'local',
      food: {
        id: 'food-abc',
        name: 'Peanut Butter',
        brand: 'Jif',
        is_custom: false,
        default_variant: { calories: 588 },
      },
    };
    foodService.lookupBarcode.mockResolvedValue(localResult);
    const res = await request(app).get('/food-crud/barcode/012345678901');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(localResult);
  });
  it('should return openfoodfacts result', async () => {
    const offResult = {
      source: 'openfoodfacts',
      food: {
        name: 'Nutella',
        brand: 'Ferrero',
        barcode: '3017620422003',
        provider_type: 'openfoodfacts',
        provider_external_id: '3017620422003',
        is_custom: false,
        default_variant: { calories: 539 },
      },
    };
    foodService.lookupBarcode.mockResolvedValue(offResult);
    const res = await request(app).get('/food-crud/barcode/3017620422003');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(offResult);
  });
  it('should return not_found result', async () => {
    foodService.lookupBarcode.mockResolvedValue({
      source: 'not_found',
      food: null,
    });
    const res = await request(app).get('/food-crud/barcode/0000000000000');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ source: 'not_found', food: null });
  });
  it('should return 500 when service throws', async () => {
    foodService.lookupBarcode.mockRejectedValue(
      new Error('DB connection lost')
    );
    const res = await request(app).get('/food-crud/barcode/012345678901');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('DB connection lost');
  });
  it('should return 400 for barcode with spaces or special characters', async () => {
    const res = await request(app).get('/food-crud/barcode/1234%205678');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid barcode format/);
    expect(foodService.lookupBarcode).not.toHaveBeenCalled();
  });
  it('should pass providerId query param to lookupBarcode', async () => {
    foodService.lookupBarcode.mockResolvedValue({
      source: 'usda',
      food: { name: 'Test USDA Food' },
    });
    const providerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const res = await request(app).get(
      `/food-crud/barcode/3017620422003?providerId=${providerId}`
    );
    expect(res.statusCode).toBe(200);
    expect(foodService.lookupBarcode).toHaveBeenCalledWith(
      '3017620422003',
      'user-123',
      providerId
    );
    expect(res.body.source).toBe('usda');
  });
});
