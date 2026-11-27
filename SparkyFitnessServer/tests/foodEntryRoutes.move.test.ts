import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import errorHandler from '../middleware/errorHandler.js';
import foodEntryRoutes from '../routes/foodEntryRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';

vi.mock('../services/foodEntryService.js');
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'diary-owner';
    req.originalUserId = 'actor';
    next();
  },
}));

const app = express();
app.use('/food-entries', foodEntryRoutes);
app.use(errorHandler);

const body = {
  sourceDate: '2026-11-24',
  targetDate: '2026-11-25',
  targetMealTypeId: '11111111-1111-4111-8111-111111111111',
  foodEntryIds: ['22222222-2222-4222-8222-222222222222'],
  loggedMealIds: ['33333333-3333-4333-8333-333333333333'],
};

describe('POST /food-entries/move', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves the selection in the authenticated diary context', async () => {
    const response = await request(app).post('/food-entries/move').send(body);

    expect(response.status).toBe(204);
    expect(foodEntryService.moveDiaryEntries).toHaveBeenCalledWith(
      'diary-owner',
      'actor',
      body
    );
    expect(clearUserTdeeCache).toHaveBeenCalledWith('diary-owner');
  });

  it.each([
    { sourceDate: '2026-11-31' },
    { targetMealTypeId: 'Dinner' },
    { foodEntryIds: [], loggedMealIds: [] },
    { userId: 'another-user' },
  ])('rejects invalid input before moving entries (%o)', async (invalid) => {
    const response = await request(app)
      .post('/food-entries/move')
      .send({ ...body, ...invalid });

    expect(response.status).toBe(400);
    expect(foodEntryService.moveDiaryEntries).not.toHaveBeenCalled();
    expect(clearUserTdeeCache).not.toHaveBeenCalled();
  });
});
