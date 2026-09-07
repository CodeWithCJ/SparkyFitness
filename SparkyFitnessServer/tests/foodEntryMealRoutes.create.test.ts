import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error no supertest types
import request from 'supertest';
import express from 'express';

// The POST body's `foods` are the whole-dish ingredient rows the service scales
// into component food_entries. Dropping them from the route silently creates an
// empty logged meal (or, with a template, ignores the user's edits), so this
// suite pins the forwarding.

vi.mock('../services/foodEntryService.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'user-1';
    req.authenticatedUserId = 'user-1';
    next();
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));

vi.mock('../services/foodPhotoLogService.js', () => ({
  default: {},
  PhotoLogError: class PhotoLogError extends Error {},
}));

vi.mock('../services/mealService.js', () => ({ default: {} }));

vi.mock('../models/foodEntryMealRepository.js', () => ({ default: {} }));

vi.mock('../middleware/imageUpload.js', () => ({
  uploadImages: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  applyImageOrder: vi.fn(),
  parseImageOrder: vi.fn(),
  finalizeUploadedImages: vi.fn(),
  cleanupStagedImages: vi.fn(),
  stagedFilesFrom: vi.fn(() => []),
  removeOrphanedImages: vi.fn(),
}));

import foodEntryService from '../services/foodEntryService.js';
import foodEntryMealRoutes from '../routes/foodEntryMealRoutes.js';
import errorHandler from '../middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use('/food-entry-meals', foodEntryMealRoutes);
app.use(errorHandler);

describe('POST /food-entry-meals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodEntryService.createFoodEntryMeal).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('forwards the whole-dish foods to the service', async () => {
    const foods = [
      { food_id: 'food-1', variant_id: 'variant-1', quantity: 200, unit: 'g' },
    ];

    await request(app)
      .post('/food-entry-meals')
      .send({
        meal_type: 'lunch',
        entry_date: '2026-06-19',
        name: 'Custom Meal',
        quantity: 50,
        unit: 'g',
        entry_total_servings: 200,
        foods,
      })
      .expect(201);

    expect(foodEntryService.createFoodEntryMeal).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ foods, entry_total_servings: 200 })
    );
  });

  it('rejects a non-positive entry_total_servings before reaching the service', async () => {
    await request(app)
      .post('/food-entry-meals')
      .send({
        meal_type: 'lunch',
        entry_date: '2026-06-19',
        quantity: 1,
        unit: 'serving',
        entry_total_servings: 0,
        foods: [],
      })
      .expect(400);

    expect(foodEntryService.createFoodEntryMeal).not.toHaveBeenCalled();
  });
});
