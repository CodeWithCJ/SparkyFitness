import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import express from 'express';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';
import labelScanService from '../services/labelScanService.js';
vi.mock('../services/labelScanService.js', () => ({
  default: {
    extractNutritionFromLabel: vi.fn(),
  },
}));

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));
const app = express();
app.use(express.json());
app.use('/food-crud', foodCrudRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});
const sampleNutrition = {
  name: 'Protein Bar',
  brand: 'FitCo',
  serving_size: 60,
  serving_unit: 'g',
  calories: 230,
  protein: 20,
  carbs: 25,
  fat: 8,
  trans_fat: 0,
  cholesterol: 10,
  potassium: 200,
  calcium: 100,
  iron: 2,
  vitamin_a: 50,
  vitamin_c: null,
};
describe('POST /food-crud/scan-label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should return 400 when image is missing', async () => {
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ mime_type: 'image/png' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/image and mime_type are required/);
    expect(labelScanService.extractNutritionFromLabel).not.toHaveBeenCalled();
  });
  it('should return 400 when mime_type is missing', async () => {
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'base64data' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/image and mime_type are required/);
    expect(labelScanService.extractNutritionFromLabel).not.toHaveBeenCalled();
  });
  it('should return 400 when body is empty', async () => {
    const res = await request(app).post('/food-crud/scan-label').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/image and mime_type are required/);
  });
  it('should return 200 with nutrition data on success', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    labelScanService.extractNutritionFromLabel.mockResolvedValue({
      success: true,
      nutrition: sampleNutrition,
    });
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'base64data', mime_type: 'image/png' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sampleNutrition);
    expect(labelScanService.extractNutritionFromLabel).toHaveBeenCalledWith(
      'base64data',
      'image/png',
      'user-123'
    );
  });
  it('should return 422 when service returns success: false', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    labelScanService.extractNutritionFromLabel.mockResolvedValue({
      success: false,
      error: 'No AI service configured',
    });
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'base64data', mime_type: 'image/png' });
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('No AI service configured');
  });
  it('should return 422 when API key is missing', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    labelScanService.extractNutritionFromLabel.mockResolvedValue({
      success: false,
      error: 'API key missing for selected AI service.',
    });
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'base64data', mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('API key missing for selected AI service.');
  });
  it('should return 500 when service throws an unhandled error', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    labelScanService.extractNutritionFromLabel.mockRejectedValue(
      new Error('Unexpected failure')
    );
    const res = await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'base64data', mime_type: 'image/png' });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unexpected failure');
  });
  it('should pass the authenticated userId to the service', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    labelScanService.extractNutritionFromLabel.mockResolvedValue({
      success: true,
      nutrition: sampleNutrition,
    });
    await request(app)
      .post('/food-crud/scan-label')
      .send({ image: 'img', mime_type: 'image/png' });
    expect(labelScanService.extractNutritionFromLabel).toHaveBeenCalledWith(
      'img',
      'image/png',
      'user-123'
    );
  });
});
