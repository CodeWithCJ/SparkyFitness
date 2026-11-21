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
      req: express.Request & { userId?: string; originalUserId?: string },
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.userId = 'user-1';
      req.originalUserId = 'user-1';
      next();
    }
  ),
}));

const app = express();
app.use(express.json());
app.use('/', foodEntryRoutes);
app.use(errorHandler);

const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const entry = {
  food_id: 'food-1',
  variant_id: 'variant-1',
  meal_type_id: 'meal-type-1',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-10-17',
};

describe('POST / client_id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: 'entry-1',
    } as never);
  });

  it('passes a valid client id through to the service', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...entry, client_id: CLIENT_ID });

    expect(res.status).toBe(201);
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ client_id: CLIENT_ID })
    );
  });

  it('rejects a client id that is not a uuid before touching the service', async () => {
    const res = await request(app)
      .post('/')
      .send({ ...entry, client_id: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/client_id/);
    expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
  });

  it('still accepts requests with no client id', async () => {
    const res = await request(app).post('/').send(entry);

    expect(res.status).toBe(201);
  });
});
