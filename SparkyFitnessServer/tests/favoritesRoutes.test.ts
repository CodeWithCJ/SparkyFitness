import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error no supertest types
import request from 'supertest';
import express from 'express';
import favoritesRoutes from '../routes/favoritesRoutes.js';
import favoritesService from '../services/favoritesService.js';
import errorHandler from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../services/favoritesService.js');
vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req: any, res: any, next: any) => {
    req.userId = 'testUserId';
    next();
  }),
}));
// Permission gate is exercised elsewhere; here it always passes.
vi.mock('../middleware/checkPermissionMiddleware', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use('/favorites', favoritesRoutes);
app.use(errorHandler);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = favoritesService as any;

describe('Favorites Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /favorites/:type/:id', () => {
    it('stars a valid food and returns 200', async () => {
      const id = uuidv4();
      svc.addFavorite.mockResolvedValue({
        type: 'food',
        id,
        is_favorite: true,
      });

      const res = await request(app).post(`/favorites/food/${id}`);

      expect(res.statusCode).toEqual(200);
      expect(svc.addFavorite).toHaveBeenCalledWith('testUserId', 'food', id);
    });

    it('rejects an unknown type with 400 and does not touch the service', async () => {
      const res = await request(app).post(`/favorites/bogus/${uuidv4()}`);

      expect(res.statusCode).toEqual(400);
      expect(svc.addFavorite).not.toHaveBeenCalled();
    });

    // Regression: a non-UUID id reaches a UUID column and raises PG 22P02, which
    // surfaced as a generic 500 instead of a client-error 400.
    it('rejects a malformed id with 400 and does not touch the service', async () => {
      const res = await request(app).post('/favorites/food/not-a-uuid');

      expect(res.statusCode).toEqual(400);
      expect(svc.addFavorite).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /favorites/:type/:id', () => {
    it('unstars a valid meal and returns 200', async () => {
      const id = uuidv4();
      svc.removeFavorite.mockResolvedValue({
        type: 'meal',
        id,
        is_favorite: false,
      });

      const res = await request(app).delete(`/favorites/meal/${id}`);

      expect(res.statusCode).toEqual(200);
      expect(svc.removeFavorite).toHaveBeenCalledWith('testUserId', 'meal', id);
    });

    it('rejects a malformed id with 400 and does not touch the service', async () => {
      const res = await request(app).delete('/favorites/meal/still-not-a-uuid');

      expect(res.statusCode).toEqual(400);
      expect(svc.removeFavorite).not.toHaveBeenCalled();
    });
  });
});
