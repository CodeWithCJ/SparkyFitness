import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import authService from '../services/authService.js';
import errorHandler from '../middleware/errorHandler.js';
import userProfileRoutes from '../routes/auth/userProfileRoutes.js';

vi.mock('../services/authService.js', () => ({
  default: {
    getUser: vi.fn(),
    updateUserMfaSettings: vi.fn(),
    verifyCurrentPassword: vi.fn(),
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

const getUser = vi.mocked(authService.getUser);
const updateMfa = vi.mocked(authService.updateUserMfaSettings);
const verifyPassword = vi.mocked(authService.verifyCurrentPassword);

describe('POST /api/identity/mfa/email-toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ mfa_totp_enabled: false } as never);
    updateMfa.mockResolvedValue(undefined as never);
  });

  it('enables email MFA without asking for the password', async () => {
    const res = await request(app)
      .post('/api/identity/mfa/email-toggle')
      .send({ enabled: true });

    expect(res.statusCode).toBe(200);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(updateMfa).toHaveBeenCalledWith(
      'test-user-id',
      undefined,
      false,
      true,
      undefined,
      undefined
    );
  });

  it('checks the current password before disabling', async () => {
    verifyPassword.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/identity/mfa/email-toggle')
      .send({ enabled: false, currentPassword: 'pw' });

    expect(res.statusCode).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith('test-user-id', 'pw');
    expect(updateMfa).toHaveBeenCalled();
  });

  it('refuses to disable with a wrong or missing password', async () => {
    verifyPassword.mockRejectedValue(
      Object.assign(new Error('Current password is incorrect.'), {
        statusCode: 401,
      })
    );

    const res = await request(app)
      .post('/api/identity/mfa/email-toggle')
      .send({ enabled: false });

    expect(res.statusCode).toBe(401);
    expect(updateMfa).not.toHaveBeenCalled();
  });

  it('returns 400 when enabled is not a boolean', async () => {
    const res = await request(app)
      .post('/api/identity/mfa/email-toggle')
      .send({ enabled: 'false' });

    expect(res.statusCode).toBe(400);
    expect(updateMfa).not.toHaveBeenCalled();
  });

  it('returns 400 when the request has no JSON body', async () => {
    const res = await request(app)
      .post('/api/identity/mfa/email-toggle')
      .set('Content-Type', 'text/plain')
      .send('enabled=false');

    expect(res.statusCode).toBe(400);
    expect(updateMfa).not.toHaveBeenCalled();
  });
});
