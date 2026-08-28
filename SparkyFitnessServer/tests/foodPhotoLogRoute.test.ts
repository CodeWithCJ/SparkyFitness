import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest has no types
import request from 'supertest';
import express from 'express';
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
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

const createMealFromDiaryEntriesMock = vi.fn();
vi.mock('../services/mealService.js', () => ({
  default: {
    createMealFromDiaryEntries: (...a: unknown[]) =>
      createMealFromDiaryEntriesMock(...(a as [])),
  },
}));

let canAccess = true;
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(async () => canAccess),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn<RequestHandler>((req, _res, next) => {
    // `userId` / `authenticatedUserId` are attached by the real auth
    // middleware via an Express Request augmentation.
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    (): RequestHandler => (_req: Request, _res: Response, next: NextFunction) =>
      next()
  ),
}));
vi.mock('../middleware/imageUpload.js', () => ({
  uploadImages: (_req: Request, _res: Response, next: NextFunction) => next(),
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
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
};
app.use(errorHandler);

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
  meal_template_id: null,
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

  describe('save_as_meal', () => {
    const withMeal = {
      ...validBody,
      save_as_meal: { name: 'Chicken Biryani' },
    };

    it('creates a reusable template scoped to the logged meal', async () => {
      createMealFromDiaryEntriesMock.mockResolvedValue({
        id: '66666666-6666-4666-8666-666666666666',
      });

      const res = await request(app)
        .post('/food-entry-meals/from-photo-estimate')
        .send(withMeal);

      expect(res.status).toBe(201);
      expect(res.body.meal_template_id).toBe(
        '66666666-6666-4666-8666-666666666666'
      );
      // The last argument scopes it to this logged meal; without it the
      // template would absorb everything else logged at that meal type.
      expect(createMealFromDiaryEntriesMock).toHaveBeenCalledWith(
        'user-123',
        '2026-08-27',
        'lunch',
        'Chicken Biryani',
        null,
        false,
        successResult.food_entry_meal_id
      );
    });

    it('does not create a template when none was asked for', async () => {
      const res = await request(app)
        .post('/food-entry-meals/from-photo-estimate')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.meal_template_id).toBeNull();
      expect(createMealFromDiaryEntriesMock).not.toHaveBeenCalled();
    });

    it('still reports the log as successful when the template fails', async () => {
      createMealFromDiaryEntriesMock.mockRejectedValue(new Error('boom'));

      const res = await request(app)
        .post('/food-entry-meals/from-photo-estimate')
        .send(withMeal);

      // The diary rows are what the user asked for; losing them because a
      // convenience failed would be the worse outcome.
      expect(res.status).toBe(201);
      expect(res.body.food_entry_ids).toHaveLength(2);
      expect(res.body.meal_template_id).toBeNull();
    });

    it('rejects save_as_meal in combined mode', async () => {
      const res = await request(app)
        .post('/food-entry-meals/from-photo-estimate')
        .send({
          ...withMeal,
          mode: 'combined',
          items: [{ source: 'new', food: NEW_FOOD, quantity: 410, unit: 'g' }],
        });

      expect(res.status).toBe(400);
      expect(createMealFromDiaryEntriesMock).not.toHaveBeenCalled();
    });
  });
});
