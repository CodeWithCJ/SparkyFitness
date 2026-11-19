import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryRoutes from '../routes/foodEntryRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/foodEntryService.js');
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
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
      req.userId = USER_ID;
      req.originalUserId = USER_ID;
      next();
    }
  ),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const FOOD_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';

const app = express();
app.use(express.json());
app.use('/', foodEntryRoutes);
app.use(errorHandler);

describe('cooked_quantity on POST and PUT /food-entries (#3534)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    });
    vi.mocked(foodEntryService.updateFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    });
  });

  it.each([0, -5, '300', true])(
    'rejects cooked_quantity %s on create before the service',
    async (value) => {
      const response = await request(app)
        .post('/')
        .send({ quantity: 120, unit: 'g', cooked_quantity: value });
      expect(response.status).toBe(400);
      expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
    }
  );

  it('passes a positive cooked weight to the service on create', async () => {
    const response = await request(app)
      .post('/')
      .send({ quantity: 120, unit: 'g', cooked_quantity: 300 });
    expect(response.status).toBe(201);
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      expect.objectContaining({ cooked_quantity: 300 })
    );
  });

  it('rejects an invalid cooked_quantity on update', async () => {
    const response = await request(app)
      .put(`/${ENTRY_ID}`)
      .send({ cooked_quantity: 0 });
    expect(response.status).toBe(400);
    expect(foodEntryService.updateFoodEntry).not.toHaveBeenCalled();
  });

  it('accepts null on update to clear it', async () => {
    const response = await request(app)
      .put(`/${ENTRY_ID}`)
      .send({ cooked_quantity: null });
    expect(response.status).toBe(200);
  });

  it('returns the 400 the service raises for a non-weight unit', async () => {
    vi.mocked(foodEntryService.createFoodEntry).mockRejectedValue(
      Object.assign(
        new Error(
          'cooked_quantity is only allowed for weight units (g, kg, oz, lb).'
        ),
        { statusCode: 400 }
      )
    );
    const response = await request(app)
      .post('/')
      .send({ quantity: 1, unit: 'cup', cooked_quantity: 150 });
    expect(response.status).toBe(400);
  });
});

describe('GET /food-entries/last-cooked (#3534)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the last cooked entry of the food', async () => {
    const entry = {
      id: ENTRY_ID,
      entry_date: '2026-11-13',
      quantity: 120,
      unit: 'g',
      cooked_quantity: 300,
    };
    vi.mocked(foodEntryService.getLastCookedFoodEntry).mockResolvedValue(entry);
    const response = await request(app)
      .get('/last-cooked')
      .query({ food_id: FOOD_ID });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entry });
    expect(foodEntryService.getLastCookedFoodEntry).toHaveBeenCalledWith(
      USER_ID,
      FOOD_ID
    );
  });

  it('returns entry null when the food was never logged cooked', async () => {
    vi.mocked(foodEntryService.getLastCookedFoodEntry).mockResolvedValue(null);
    const response = await request(app)
      .get('/last-cooked')
      .query({ food_id: FOOD_ID });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entry: null });
  });

  it('rejects a missing or malformed food_id', async () => {
    const missing = await request(app).get('/last-cooked');
    const malformed = await request(app)
      .get('/last-cooked')
      .query({ food_id: 'rice' });
    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(foodEntryService.getLastCookedFoodEntry).not.toHaveBeenCalled();
  });

  it('checks diary access before reading another user', async () => {
    vi.mocked(canAccessUserData).mockResolvedValue(false);
    const response = await request(app)
      .get('/last-cooked')
      .query({ food_id: FOOD_ID, userId: OTHER_USER_ID });
    expect(response.status).toBe(403);
    expect(canAccessUserData).toHaveBeenCalledWith(
      OTHER_USER_ID,
      'diary',
      USER_ID
    );
    expect(foodEntryService.getLastCookedFoodEntry).not.toHaveBeenCalled();
  });

  it('reads another user when diary access is granted', async () => {
    vi.mocked(canAccessUserData).mockResolvedValue(true);
    vi.mocked(foodEntryService.getLastCookedFoodEntry).mockResolvedValue(null);
    const response = await request(app)
      .get('/last-cooked')
      .query({ food_id: FOOD_ID, userId: OTHER_USER_ID });
    expect(response.status).toBe(200);
    expect(foodEntryService.getLastCookedFoodEntry).toHaveBeenCalledWith(
      OTHER_USER_ID,
      FOOD_ID
    );
  });
});
