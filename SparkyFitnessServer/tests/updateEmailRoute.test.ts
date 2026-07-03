import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import authService from '../services/authService.js';
import errorHandler from '../middleware/errorHandler.js';
import userProfileRoutes from '../routes/auth/userProfileRoutes.js';

vi.mock('../services/authService.js', () => ({
  default: {
    updateUserEmail: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('multer', () => {
  const multer = () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    single: () => (_req: any, _res: any, next: any) => next(),
  });
  multer.diskStorage = () => ({});
  return { default: multer };
});

const app = express();
app.use(express.json());
app.use('/api/identity', userProfileRoutes);
app.use(errorHandler);

describe('POST /api/identity/update-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when email is updated successfully', async () => {
    // @ts-expect-error TS(2339)
    authService.updateUserEmail.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/identity/update-email')
      .send({ newEmail: 'new@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(authService.updateUserEmail).toHaveBeenCalledWith(
      'test-user-id',
      'new@example.com'
    );
  });

  it('returns 400 when newEmail is missing', async () => {
    const res = await request(app).post('/api/identity/update-email').send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'New email is required.');
    expect(authService.updateUserEmail).not.toHaveBeenCalled();
  });

  it('returns 500 when email is already in use (service throws plain Error)', async () => {
    // @ts-expect-error TS(2339)
    authService.updateUserEmail.mockRejectedValue(
      new Error('Email already in use by another account.')
    );

    const res = await request(app)
      .post('/api/identity/update-email')
      .send({ newEmail: 'taken@example.com' });

    expect(authService.updateUserEmail).toHaveBeenCalledWith(
      'test-user-id',
      'taken@example.com'
    );
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on unexpected service errors', async () => {
    // @ts-expect-error TS(2339)
    authService.updateUserEmail.mockRejectedValue(
      new Error('DB connection failed')
    );

    const res = await request(app)
      .post('/api/identity/update-email')
      .send({ newEmail: 'new@example.com' });

    expect(res.statusCode).toBe(500);
  });
});
