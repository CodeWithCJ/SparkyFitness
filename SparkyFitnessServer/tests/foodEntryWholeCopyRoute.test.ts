import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryRoutes from '../routes/foodEntryRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';
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
      req.userId = 'active-family-context-c';
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
  sourceMealType: 'Lunch',
  targetDate: '2026-08-24',
  targetMealType: '33333333-3333-4333-8333-333333333333',
  entries: [{ entryId: '44444444-4444-4444-8444-444444444444', quantity: 150 }],
};

describe('POST /copy-reviewed-from-user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses actor A as target, actor, and cache owner when active context C copies source B', async () => {
    vi.mocked(
      foodEntryService.copyReviewedFoodEntriesFromUser
    ).mockResolvedValue([{ id: 'copy-1' }]);

    const response = await request(app)
      .post('/copy-reviewed-from-user')
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual([{ id: 'copy-1' }]);
    expect(
      foodEntryService.copyReviewedFoodEntriesFromUser
    ).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      body.familyUserId,
      body.sourceDate,
      body.sourceMealType,
      body.targetDate,
      body.targetMealType,
      body.entries
    );
    expect(clearUserTdeeCache).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('rejects unknown fields before calling the reviewed whole-copy service', async () => {
    const response = await request(app)
      .post('/copy-reviewed-from-user')
      .send({ ...body, unexpected: true });

    expect(response.status).toBe(400);
    expect(
      foodEntryService.copyReviewedFoodEntriesFromUser
    ).not.toHaveBeenCalled();
  });

  it('preserves a stale reviewed snapshot conflict through the error handler', async () => {
    const conflict = Object.assign(
      new Error(
        'One or more source entries changed. Refresh the family diary.'
      ),
      { statusCode: 409 }
    );
    vi.mocked(
      foodEntryService.copyReviewedFoodEntriesFromUser
    ).mockRejectedValue(conflict);

    const response = await request(app)
      .post('/copy-reviewed-from-user')
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'One or more source entries changed. Refresh the family diary.',
    });
  });
});
