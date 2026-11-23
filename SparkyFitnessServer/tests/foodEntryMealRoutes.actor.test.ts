import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error no supertest types
import request from 'supertest';
import express from 'express';

// The logged-meal router checks the real caller, never the account they
// switched to, and mounts the diary permission check once for every handler.

const guard = vi.hoisted(() => vi.fn());
const canAccess = vi.hoisted(() => vi.fn());

vi.mock('../services/foodEntryService.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
    getFoodEntryMealWithComponents: vi.fn(),
  },
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request & Record<string, unknown>,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    // Caller "actor" switched into "owner"'s account.
    req.userId = 'owner';
    req.originalUserId = 'actor';
    req.authenticatedUserId = 'actor';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: (type: string) => {
    guard(type);
    return (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => next();
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: canAccess,
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
import router from '../routes/foodEntryMealRoutes.js';

// Recorded before any test clears the mocks: the router mounts it on import.
const mountedGuards = guard.mock.calls.map((call) => call[0]);

describe('food entry meal routes: whose permission is checked', () => {
  const app = express();
  app.use(express.json());
  app.use('/', router);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the diary permission check on the router', () => {
    expect(mountedGuards).toContain('diary');
  });

  it('checks the real caller against the switched account when logging a meal', async () => {
    canAccess.mockResolvedValue(false);
    const res = await request(app).post('/').send({
      meal_type: 'lunch',
      entry_date: '2026-11-22',
      foods: [],
      user_id: 'owner',
    });
    expect(res.status).toBe(403);
    expect(canAccess).toHaveBeenCalledWith('owner', 'diary', 'actor');
    expect(foodEntryService.createFoodEntryMeal).not.toHaveBeenCalled();
  });

  it('checks the real caller when updating a meal', async () => {
    vi.mocked(
      foodEntryService.getFoodEntryMealWithComponents
    ).mockResolvedValue({
      id: 'm1',
      user_id: 'owner',
    } as never);
    canAccess.mockResolvedValue(false);
    const res = await request(app).put('/m1').send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(canAccess).toHaveBeenCalledWith('owner', 'diary', 'actor');
  });
});
