import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest has no types
import request from 'supertest';
import express from 'express';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';
import foodPhotoEstimationService from '../services/foodPhotoEstimationService.js';

vi.mock('../services/foodPhotoEstimationService.js', () => ({
  default: {
    estimateFoodPhotoNutrition: vi.fn(),
  },
}));

vi.mock('../services/labelScanService.js', () => ({
  default: { extractNutritionFromLabel: vi.fn() },
}));

vi.mock('../services/foodService.js', () => ({
  default: { lookupBarcode: vi.fn() },
}));

let authenticateBehavior: 'success' | 'reject' = 'success';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, res: any, next: any) => {
    if (authenticateBehavior === 'reject') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/food-crud', foodCrudRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

const sampleEstimate = {
  meal_summary: 'Pasta with marinara',
  overall_confidence: 'medium',
  confidence_reason: 'Sauce ingredients unclear',
  items: [],
  totals: {
    calories_kcal: 400,
    protein_g: 14,
    carbs_g: 70,
    fat_g: 8,
    fiber_g: 4,
    sugar_g: 6,
    total_grams: 300,
  },
  user_weight_reconciliation: '',
  clarifying_questions: [],
};

describe('POST /food-crud/estimate-food-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateBehavior = 'success';
  });

  it('returns 400 INVALID_REQUEST when image is missing', async () => {
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_REQUEST when mime_type is missing', async () => {
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 UNSUPPORTED_MIME_TYPE for application/pdf', async () => {
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'application/pdf' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_MIME_TYPE');
  });

  it('returns 400 UNSUPPORTED_MIME_TYPE for image/gif (intentionally excluded)', async () => {
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'image/gif' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_MIME_TYPE');
  });

  it('returns 400 IMAGE_TOO_LARGE when base64 image exceeds 8MB', async () => {
    const huge = 'a'.repeat(8 * 1024 * 1024 + 1);
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: huge, mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('IMAGE_TOO_LARGE');
  });

  it('returns 400 INVALID_REQUEST when total_weight is provided without weight_unit', async () => {
    const res = await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      total_weight: 100,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 INVALID_REQUEST when weight_unit is provided without total_weight', async () => {
    const res = await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      weight_unit: 'g',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it("returns 400 INVALID_REQUEST when weight_unit is 'kg'", async () => {
    const res = await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      total_weight: 1,
      weight_unit: 'kg',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 INVALID_REQUEST when total_weight is not positive', async () => {
    const res = await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      total_weight: 0,
      weight_unit: 'g',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 INVALID_REQUEST when description exceeds 500 chars', async () => {
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({
        image: 'aGVsbG8=',
        mime_type: 'image/jpeg',
        description: 'x'.repeat(501),
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 200 with the estimate on success', async () => {
    // @ts-expect-error mocked
    foodPhotoEstimationService.estimateFoodPhotoNutrition.mockResolvedValue({
      success: true,
      estimate: sampleEstimate,
    });
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sampleEstimate);
  });

  it.each([
    ['NO_AI_CONFIGURED', 422],
    ['UNSUPPORTED_PROVIDER', 422],
    ['API_KEY_MISSING', 422],
    ['CONTENT_BLOCKED', 422],
    ['PARSE_ERROR', 422],
    ['UPSTREAM_ERROR', 502],
  ])('maps service code %s to HTTP %i', async (code, status) => {
    // @ts-expect-error mocked
    foodPhotoEstimationService.estimateFoodPhotoNutrition.mockResolvedValue({
      success: false,
      code,
      error: `mocked ${code}`,
    });
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: `mocked ${code}`, code });
  });

  it('converts oz to grams and passes both in the weight slot', async () => {
    // @ts-expect-error mocked
    foodPhotoEstimationService.estimateFoodPhotoNutrition.mockResolvedValue({
      success: true,
      estimate: sampleEstimate,
    });
    await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      total_weight: 16,
      weight_unit: 'oz',
    });
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        weightSlot: '16 oz (approximately 454 g)',
        base64Image: 'aGVsbG8=',
        mimeType: 'image/jpeg',
        userId: 'user-123',
      })
    );
  });

  it('passes a gram-only weight slot when weight_unit is g', async () => {
    // @ts-expect-error mocked
    foodPhotoEstimationService.estimateFoodPhotoNutrition.mockResolvedValue({
      success: true,
      estimate: sampleEstimate,
    });
    await request(app).post('/food-crud/estimate-food-photo').send({
      image: 'aGVsbG8=',
      mime_type: 'image/jpeg',
      total_weight: 450,
      weight_unit: 'g',
    });
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).toHaveBeenCalledWith(expect.objectContaining({ weightSlot: '450 g' }));
  });

  it('passes an empty weight slot when no weight is given', async () => {
    // @ts-expect-error mocked
    foodPhotoEstimationService.estimateFoodPhotoNutrition.mockResolvedValue({
      success: true,
      estimate: sampleEstimate,
    });
    await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'image/jpeg' });
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).toHaveBeenCalledWith(expect.objectContaining({ weightSlot: '' }));
  });

  it('returns 401 when authenticate rejects (handler not invoked)', async () => {
    authenticateBehavior = 'reject';
    const res = await request(app)
      .post('/food-crud/estimate-food-photo')
      .send({ image: 'aGVsbG8=', mime_type: 'image/jpeg' });
    expect(res.statusCode).toBe(401);
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).not.toHaveBeenCalled();
  });
});
