import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest has no types
import request from 'supertest';
import express from 'express';
import foodEntryMealRoutes from '../routes/foodEntryMealRoutes.js';
import foodPhotoLogService from '../services/foodPhotoLogService.js';
import { PhotoLogError } from '../services/foodPhotoLogService.js';

vi.mock('../services/foodPhotoLogService.js', async () => {
  const actual = await vi.importActual<
    typeof import('../services/foodPhotoLogService.js')
  >('../services/foodPhotoLogService.js');
  return {
    ...actual,
    default: { createPhotoLoggedMeal: vi.fn() },
  };
});

vi.mock('../services/foodEntryService.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
    getFoodEntryMealsByDate: vi.fn(),
    updateFoodEntryMeal: vi.fn(),
    deleteFoodEntryMeal: vi.fn(),
    getFoodEntryMealById: vi.fn(),
  },
}));
vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: { getFoodEntryMealById: vi.fn() },
  createFoodEntryMealWithClient: vi.fn(),
  resolveMealTypeIdWithClient: vi.fn(),
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));

let canAccess = true;
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(async () => canAccess),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));
vi.mock('../middleware/imageUpload.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadImages: (req: any, res: any, next: any) => next(),
  applyImageOrder: vi.fn(),
  parseImageOrder: vi.fn(),
  finalizeUploadedImages: vi.fn(),
  cleanupStagedImages: vi.fn(),
  stagedFilesFrom: vi.fn(() => []),
  removeOrphanedImages: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/food-entry-meals', foodEntryMealRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

const NEW_FOOD = {
  name: 'Steamed broccoli',
  brand: null,
  serving_size: 100,
  serving_unit: 'g',
  calories: 104.7,
  protein: 3.5,
  carbs: 8.2,
  fat: 1.2,
};

const validBody = {
  mode: 'grouped',
  entry_date: '2026-08-27',
  meal_type: 'lunch',
  name: 'Grilled chicken with rice and broccoli',
  items: [
    {
      source: 'existing',
      food_id: '11111111-1111-4111-8111-111111111111',
      variant_id: '22222222-2222-4222-8222-222222222222',
      quantity: 145,
      unit: 'g',
    },
    { source: 'new', food: NEW_FOOD, quantity: 85, unit: 'g' },
  ],
};

const successResult = {
  mode: 'grouped' as const,
  food_entry_meal_id: '33333333-3333-4333-8333-333333333333',
  food_entry_ids: [
    '44444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444445',
  ],
  created_food_ids: ['55555555-5555-4555-8555-555555555555'],
};

describe('POST /food-entry-meals/from-photo-estimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccess = true;
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockResolvedValue(
      successResult
    );
  });

  it('logs a grouped estimate and returns 201 with the created ids', async () => {
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(successResult);
    expect(foodPhotoLogService.createPhotoLoggedMeal).toHaveBeenCalledWith(
      'user-123',
      'user-123',
      expect.objectContaining({ mode: 'grouped' })
    );
  });

  it('passes schema-applied defaults through to the service', async () => {
    await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    const payload = vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mock
      .calls[0][2];
    expect(payload.entry_time).toBeNull();
    expect(payload.meal_type_id).toBeNull();
    expect(payload.description).toBeNull();
  });

  it('rejects an invalid payload with 400 and the validation issues', async () => {
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send({ ...validBody, entry_date: 'not-a-day' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(foodPhotoLogService.createPhotoLoggedMeal).not.toHaveBeenCalled();
  });

  it('rejects a combined payload carrying more than one item', async () => {
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send({
        ...validBody,
        mode: 'combined',
        items: [
          { source: 'new', food: NEW_FOOD, quantity: 85, unit: 'g' },
          { source: 'new', food: NEW_FOOD, quantity: 85, unit: 'g' },
        ],
      });

    expect(res.status).toBe(400);
    expect(foodPhotoLogService.createPhotoLoggedMeal).not.toHaveBeenCalled();
  });

  it('refuses a client attempt to set food-library hygiene flags', async () => {
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send({
        ...validBody,
        items: [
          {
            source: 'new',
            food: { ...NEW_FOOD, is_quick_food: false },
            quantity: 85,
            unit: 'g',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(foodPhotoLogService.createPhotoLoggedMeal).not.toHaveBeenCalled();
  });

  it('maps VARIANT_NOT_FOUND to 404', async () => {
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockRejectedValue(
      new PhotoLogError('VARIANT_NOT_FOUND', 'Food variant x was not found.')
    );
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('VARIANT_NOT_FOUND');
  });

  it('maps FOOD_NOT_FOUND to 404', async () => {
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockRejectedValue(
      new PhotoLogError('FOOD_NOT_FOUND', 'mismatch')
    );
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    expect(res.status).toBe(404);
  });

  it('maps INVALID_MEAL_TYPE to 400', async () => {
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockRejectedValue(
      new PhotoLogError('INVALID_MEAL_TYPE', 'Invalid meal type: brunchh')
    );
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MEAL_TYPE');
  });

  it('forwards an unexpected error to the error handler as 500', async () => {
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockRejectedValue(
      new Error('connection terminated')
    );
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);

    expect(res.status).toBe(500);
  });

  it('returns 403 when logging for another user without diary permission', async () => {
    canAccess = false;
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send({ ...validBody, user_id: '99999999-9999-4999-8999-999999999999' });

    expect(res.status).toBe(403);
    expect(foodPhotoLogService.createPhotoLoggedMeal).not.toHaveBeenCalled();
  });

  it('logs for another user when diary permission is granted', async () => {
    canAccess = true;
    vi.mocked(foodPhotoLogService.createPhotoLoggedMeal).mockResolvedValue({
      ...successResult,
      mode: 'grouped',
    });
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send({ ...validBody, user_id: '99999999-9999-4999-8999-999999999999' });

    expect(res.status).toBe(201);
    expect(foodPhotoLogService.createPhotoLoggedMeal).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      'user-123',
      expect.anything()
    );
  });

  it('is not shadowed by the /:id routes', async () => {
    // `/from-photo-estimate` must be registered before `/:id`, or a POST would
    // never reach it. A 201 here proves the ordering.
    const res = await request(app)
      .post('/food-entry-meals/from-photo-estimate')
      .send(validBody);
    expect(res.status).toBe(201);
  });
});
