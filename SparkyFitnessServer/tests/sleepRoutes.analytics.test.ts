import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import sleepAnalyticsService from '../services/sleepAnalyticsService.js';
import sleepRoutes from '../routes/sleepRoutes.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'user-1';
    next();
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
vi.mock('../services/measurementService.js', () => ({ default: {} }));
vi.mock('../services/sleepAnalyticsService.js', () => ({
  default: { getSleepAnalytics: vi.fn() },
}));

const app = express();
app.use('/api/sleep', sleepRoutes);

describe('GET /api/sleep/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepAnalyticsService.getSleepAnalytics).mockResolvedValue([]);
  });

  it('passes the dates and the signed-in user as strings', async () => {
    const res = await request(app).get(
      '/api/sleep/analytics?startDate=2026-10-01&endDate=2026-10-24'
    );
    expect(res.statusCode).toBe(200);
    expect(sleepAnalyticsService.getSleepAnalytics).toHaveBeenCalledWith(
      'user-1',
      '2026-10-01',
      '2026-10-24'
    );
  });

  it('refuses a date given twice', async () => {
    const res = await request(app).get(
      '/api/sleep/analytics?startDate=2026-10-01&startDate=2026-10-02&endDate=2026-10-24'
    );
    expect(res.statusCode).toBe(400);
    expect(sleepAnalyticsService.getSleepAnalytics).not.toHaveBeenCalled();
  });

  it('uses a userId from the query when one is given', async () => {
    await request(app).get(
      '/api/sleep/analytics?startDate=2026-10-01&endDate=2026-10-24&userId=user-2'
    );
    expect(sleepAnalyticsService.getSleepAnalytics).toHaveBeenCalledWith(
      'user-2',
      '2026-10-01',
      '2026-10-24'
    );
  });
});
