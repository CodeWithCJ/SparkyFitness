import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import shoeRoutes from '../routes/v2/shoeRoutes.js';
import * as shoeRepo from '../models/shoeRepository.js';

vi.mock('../models/shoeRepository.js', () => ({
  getShoes: vi.fn(),
  getShoeById: vi.fn(),
  createShoe: vi.fn(),
  updateShoe: vi.fn(),
  deleteShoe: vi.fn(),
  assignShoeToExerciseEntry: vi.fn(),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
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

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/shoes', shoeRoutes);
app.use(errorHandler);

const SHOE_ID = uuidv4();
const ENTRY_ID = uuidv4();

describe('Shoe Routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists shoes and passes the status filter', async () => {
    vi.mocked(shoeRepo.getShoes).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/shoes?status=active');
    expect(res.statusCode).toBe(200);
    expect(shoeRepo.getShoes).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      'active'
    );
  });

  it('rejects an unknown status filter', async () => {
    const res = await request(app).get('/api/v2/shoes?status=lost');
    expect(res.statusCode).toBe(400);
    expect(shoeRepo.getShoes).not.toHaveBeenCalled();
  });

  it('creates a shoe', async () => {
    vi.mocked(shoeRepo.createShoe).mockResolvedValue({
      id: SHOE_ID,
    } as Awaited<ReturnType<typeof shoeRepo.createShoe>>);
    const res = await request(app)
      .post('/api/v2/shoes')
      .send({ name: 'Pegasus 41', brand: 'Nike', is_default: true });
    expect(res.statusCode).toBe(201);
    expect(shoeRepo.createShoe).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ name: 'Pegasus 41', is_default: true }),
      'test-user-id'
    );
  });

  it('rejects a shoe without a name or with a non-positive retirement distance', async () => {
    const noName = await request(app)
      .post('/api/v2/shoes')
      .send({ brand: 'X' });
    expect(noName.statusCode).toBe(400);
    const badLimit = await request(app)
      .post('/api/v2/shoes')
      .send({ name: 'A', retirement_distance_km: 0 });
    expect(badLimit.statusCode).toBe(400);
    expect(shoeRepo.createShoe).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing shoe', async () => {
    vi.mocked(shoeRepo.getShoeById).mockResolvedValue(null);
    const res = await request(app).get(`/api/v2/shoes/${SHOE_ID}`);
    expect(res.statusCode).toBe(404);
  });

  it('rejects an explicitly null name before calling the repository', async () => {
    const res = await request(app)
      .put(`/api/v2/shoes/${SHOE_ID}`)
      .send({ name: null });
    expect(res.statusCode).toBe(400);
    expect(shoeRepo.updateShoe).not.toHaveBeenCalled();
  });

  it('updates a shoe (retire)', async () => {
    vi.mocked(shoeRepo.updateShoe).mockResolvedValue({
      id: SHOE_ID,
      status: 'retired',
    } as Awaited<ReturnType<typeof shoeRepo.updateShoe>>);
    const res = await request(app)
      .put(`/api/v2/shoes/${SHOE_ID}`)
      .send({ status: 'retired' });
    expect(res.statusCode).toBe(200);
    expect(shoeRepo.updateShoe).toHaveBeenCalledWith(
      'test-user-id',
      SHOE_ID,
      { status: 'retired' },
      'test-user-id'
    );
  });

  it('deletes a shoe and 404s when it is gone', async () => {
    vi.mocked(shoeRepo.deleteShoe).mockResolvedValueOnce(true);
    expect(
      (await request(app).delete(`/api/v2/shoes/${SHOE_ID}`)).statusCode
    ).toBe(200);
    vi.mocked(shoeRepo.deleteShoe).mockResolvedValueOnce(false);
    expect(
      (await request(app).delete(`/api/v2/shoes/${SHOE_ID}`)).statusCode
    ).toBe(404);
  });

  describe('PUT /assignments/:exerciseEntryId', () => {
    it('links a shoe to an entry', async () => {
      vi.mocked(shoeRepo.assignShoeToExerciseEntry).mockResolvedValue({
        exercise_entry_id: ENTRY_ID,
        shoe_id: SHOE_ID,
      });
      const res = await request(app)
        .put(`/api/v2/shoes/assignments/${ENTRY_ID}`)
        .send({ shoe_id: SHOE_ID });
      expect(res.statusCode).toBe(200);
      expect(shoeRepo.assignShoeToExerciseEntry).toHaveBeenCalledWith(
        'test-user-id',
        ENTRY_ID,
        SHOE_ID,
        'test-user-id'
      );
    });

    it('clears the link with null', async () => {
      vi.mocked(shoeRepo.assignShoeToExerciseEntry).mockResolvedValue({
        exercise_entry_id: ENTRY_ID,
        shoe_id: null,
      });
      const res = await request(app)
        .put(`/api/v2/shoes/assignments/${ENTRY_ID}`)
        .send({ shoe_id: null });
      expect(res.statusCode).toBe(200);
      expect(res.body.shoe_id).toBeNull();
    });

    it('400s on a non-uuid shoe id and 404s on an unknown entry', async () => {
      const bad = await request(app)
        .put(`/api/v2/shoes/assignments/${ENTRY_ID}`)
        .send({ shoe_id: 'nope' });
      expect(bad.statusCode).toBe(400);
      vi.mocked(shoeRepo.assignShoeToExerciseEntry).mockResolvedValue(null);
      const missing = await request(app)
        .put(`/api/v2/shoes/assignments/${ENTRY_ID}`)
        .send({ shoe_id: SHOE_ID });
      expect(missing.statusCode).toBe(404);
    });
  });
});
