import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import foodService from '../services/foodService.js';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/foodService.js', () => ({
  default: { updateFoodEntriesSnapshot: vi.fn() },
}));

const app = express();
app.use(express.json());
app.use('/foods', foodCrudRoutes);

describe('POST /foods/update-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodService.updateFoodEntriesSnapshot.mockResolvedValue({ message: 'ok' });
  });

  const syncImagesArg = () =>
    // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
    foodService.updateFoodEntriesSnapshot.mock.calls[0][3];

  it('requires foodId', async () => {
    const res = await request(app).post('/foods/update-snapshot').send({});
    expect(res.status).toBe(400);
    expect(foodService.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });

  it('defaults to syncing photos when the flag is omitted', async () => {
    // Clients predating the flag always synced photos; that must not change
    // under them.
    const res = await request(app)
      .post('/foods/update-snapshot')
      .send({ foodId: 'food-1' });

    expect(res.status).toBe(200);
    expect(syncImagesArg()).toBe(true);
  });

  it('passes an explicit false through for a nutrition-only sync', async () => {
    const res = await request(app)
      .post('/foods/update-snapshot')
      .send({ foodId: 'food-1', syncImages: false });

    expect(res.status).toBe(200);
    expect(syncImagesArg()).toBe(false);
  });

  it.each([['false'], ['true'], [0], [1], [null]])(
    'rejects a non-boolean syncImages (%p) instead of coercing it',
    async (syncImages) => {
      // Every non-empty string is truthy, so coercing "false" would silently
      // pick the path that overwrites and deletes diary-specific photos.
      const res = await request(app)
        .post('/foods/update-snapshot')
        .send({ foodId: 'food-1', syncImages });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('syncImages must be a boolean.');
      expect(foodService.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    }
  );
});
