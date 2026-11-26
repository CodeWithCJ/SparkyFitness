import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
// @ts-expect-error no supertest types
import request from 'supertest';
import foodService from '../services/foodService.js';
import foodCrudRoutes from '../routes/foodCrudRoutes.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/foodService.js', () => ({
  default: { createFood: vi.fn(), updateFood: vi.fn() },
}));

const app = express();
app.use(express.json());
app.use('/foods', foodCrudRoutes);

const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const body = { name: 'Bread', serving_size: 50, serving_unit: 'g' };

describe('POST /foods with a client id (offline replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodService.createFood).mockResolvedValue({
      id: 'food-1',
      images: [],
    } as never);
  });

  it('hands the key to the service', async () => {
    await request(app)
      .post('/foods')
      .send({ ...body, client_id: CLIENT_ID })
      .expect(201);

    expect(foodService.createFood).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ client_id: CLIENT_ID })
    );
  });

  it('rejects a key that is not a uuid before reaching the service', async () => {
    await request(app)
      .post('/foods')
      .send({ ...body, client_id: 'nope' })
      .expect(400);

    expect(foodService.createFood).not.toHaveBeenCalled();
  });

  it('still creates a food with no key', async () => {
    await request(app).post('/foods').send(body).expect(201);

    expect(foodService.createFood).toHaveBeenCalledTimes(1);
  });
});
