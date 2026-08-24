import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryRoutes from '../routes/foodEntryRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/foodEntryService.js');
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next()
  ),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn(
    (
      req: express.Request & {
        userId?: string;
        authenticatedUserId?: string;
        originalUserId?: string;
      },
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.userId = 'active-family-context';
      req.authenticatedUserId = '11111111-1111-4111-8111-111111111111';
      req.originalUserId = '11111111-1111-4111-8111-111111111111';
      next();
    }
  ),
}));

const app = express();
app.use(express.json());
app.use('/', foodEntryRoutes);
app.use(errorHandler);

const body = {
  familyUserId: '22222222-2222-4222-8222-222222222222',
  sourceDate: '2026-08-23',
  targetDate: '2026-08-24',
  targetMealType: '33333333-3333-4333-8333-333333333333',
  entries: [{ entryId: '44444444-4444-4444-8444-444444444444', quantity: 150 }],
};

describe('POST /copy-selected-from-user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unknown fields before calling the selected-copy service', async () => {
    const response = await request(app)
      .post('/copy-selected-from-user')
      .send({ ...body, extra: true });

    expect(response.status).toBe(400);
    expect(
      foodEntryService.copySelectedFoodEntriesFromUser
    ).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor as both target and actor when family context is active', async () => {
    vi.mocked(
      foodEntryService.copySelectedFoodEntriesFromUser
    ).mockResolvedValue([{ id: 'copy-1' }]);

    const response = await request(app)
      .post('/copy-selected-from-user')
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual([{ id: 'copy-1' }]);
    expect(
      foodEntryService.copySelectedFoodEntriesFromUser
    ).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      body.familyUserId,
      body.sourceDate,
      body.targetDate,
      body.targetMealType,
      body.entries
    );
  });

  it('preserves a service conflict response through the error handler', async () => {
    const conflict = Object.assign(new Error('Copy conflicts with target'), {
      statusCode: 409,
    });
    vi.mocked(
      foodEntryService.copySelectedFoodEntriesFromUser
    ).mockRejectedValue(conflict);

    const response = await request(app)
      .post('/copy-selected-from-user')
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'Copy conflicts with target',
    });
  });
});
