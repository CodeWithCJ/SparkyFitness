import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): no types for supertest
import request from 'supertest';
import express from 'express';

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    authenticate: (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.userId = 'user-1';
      next();
    },
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/ouraService.js', () => ({
  default: { getStatus: vi.fn() },
}));
vi.mock('../services/stravaService.js', () => ({
  default: { getStatus: vi.fn() },
}));
vi.mock('../services/versionService.js', () => ({
  default: { getLatestGitHubRelease: vi.fn() },
}));

import ouraRoutes from '../routes/ouraRoutes.js';
import stravaRoutes from '../routes/stravaRoutes.js';
import versionRoutes from '../routes/versionRoutes.js';
import ouraService from '../services/ouraService.js';
import stravaService from '../services/stravaService.js';
import versionService from '../services/versionService.js';

const app = express();
app.use('/oura', ouraRoutes);
app.use('/strava', stravaRoutes);
app.use('/version', versionRoutes);

const pgError = () =>
  Object.assign(new Error('relation "oura_tokens" does not exist'), {
    code: '42P01',
    severity: 'ERROR',
  });

const systemError = () =>
  Object.assign(new Error('getaddrinfo ENOTFOUND api.github.internal'), {
    errno: -3008,
    syscall: 'getaddrinfo',
    code: 'ENOTFOUND',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('hand-written 5xx responses', () => {
  it('hide a database error behind the route message', async () => {
    vi.mocked(ouraService.getStatus).mockRejectedValue(pgError());

    const res = await request(app).get('/oura/status');

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      message: 'Error getting Oura status',
      error: 'Internal Server Error',
    });
  });

  it('keep an app message', async () => {
    vi.mocked(ouraService.getStatus).mockRejectedValue(
      new Error('Oura token expired')
    );

    const res = await request(app).get('/oura/status');

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Oura token expired');
  });

  it('hide a database error in an error-only body', async () => {
    vi.mocked(stravaService.getStatus).mockRejectedValue(pgError());

    const res = await request(app).get('/strava/status');

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });

  it('hide a system error in the details field', async () => {
    vi.mocked(versionService.getLatestGitHubRelease).mockRejectedValue(
      systemError()
    );

    const res = await request(app).get('/version/latest-github');

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: 'Failed to fetch latest GitHub release',
      details: 'Internal Server Error',
    });
  });
});
