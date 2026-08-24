import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import authService from '../services/authService.js';
import errorHandler from '../middleware/errorHandler.js';
import userProfileRoutes from '../routes/auth/userProfileRoutes.js';

vi.mock('../services/authService.js', () => ({
  default: {
    switchUserContext: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { authenticatedUserId: string }).authenticatedUserId =
      'auth-user-id';
    next();
  },
}));

vi.mock('multer', () => {
  const multer = () => ({
    single: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  });
  multer.diskStorage = () => ({});
  return { default: multer };
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/identity', userProfileRoutes);
app.use(errorHandler);

describe('POST /api/identity/switch-context cookie security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits Secure flag on plain HTTP requests', async () => {
    // @ts-expect-error TS(2339)
    authService.switchUserContext.mockResolvedValue({
      activeUserId: 'target-user-id',
    });

    const res = await request(app)
      .post('/api/identity/switch-context')
      .send({ targetUserId: 'target-user-id' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Context switched successfully.',
      activeUserId: 'target-user-id',
    });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies[0];
    expect(cookieStr).toContain('sparky_active_user_id=target-user-id');
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toContain('SameSite=Strict');
    expect(cookieStr).toContain('Path=/');
    expect(cookieStr).not.toContain('Secure');
  });

  it('includes Secure flag on HTTPS requests', async () => {
    // @ts-expect-error TS(2339)
    authService.switchUserContext.mockResolvedValue({
      activeUserId: 'target-user-id',
    });

    const res = await request(app)
      .post('/api/identity/switch-context')
      .set('X-Forwarded-Proto', 'https')
      .send({ targetUserId: 'target-user-id' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies[0];
    expect(cookieStr).toContain('sparky_active_user_id=target-user-id');
    expect(cookieStr).toContain('Secure');
  });
});
