import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import intervalsRoutes from '../routes/intervalsRoutes.js';
import intervalsService from '../integrations/intervals/intervalsService.js';

const USER = '11111111-1111-1111-1111-111111111111';
const PROVIDER = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    authenticate: vi.fn(
      (req: express.Request, _res: express.Response, next: () => void) => {
        req.userId = '11111111-1111-1111-1111-111111111111';
        next();
      }
    ),
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () => (_req: express.Request, _res: express.Response, next: () => void) =>
      next(),
}));

vi.mock('../integrations/intervals/intervalsService.js', () => ({
  default: {
    syncIntervalsData: vi.fn(),
    getStatus: vi.fn(),
    disconnect: vi.fn(),
  },
  intervalsErrorStatus: vi.fn(
    (err: { response?: { status?: number } }) => err?.response?.status ?? 0
  ),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

vi.mock('../middleware/requireSelfMiddleware.js', () => ({
  default: (_req: express.Request, _res: express.Response, next: () => void) =>
    next(),
}));

vi.mock('../utils/mockDataOptions.js', () => ({
  resolveMockDataOptions: vi.fn().mockResolvedValue({
    dataSource: undefined,
    saveMockData: false,
  }),
}));

vi.mock('../services/providerSyncClaim.js', async (importActual) => ({
  ...(await importActual<typeof import('../services/providerSyncClaim.js')>()),
  startProviderSync: vi.fn(async (_target, sync) => ({ running: sync() })),
}));
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  startProviderSync,
} from '../services/providerSyncClaim.js';

describe('intervalsRoutes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/integrations/intervals', intervalsRoutes);
  });

  describe('POST /sync', () => {
    it('syncs the requested range under the provider claim', async () => {
      vi.mocked(intervalsService.syncIntervalsData).mockResolvedValue({
        success: true,
        activitiesImported: 3,
        activitiesSkipped: 0,
        activitiesFailed: 0,
        activitiesRemoved: 0,
        wellnessDays: 5,
      });

      const res = await request(app).post('/integrations/intervals/sync').send({
        providerId: PROVIDER,
        startDate: '2026-10-01',
        endDate: '2026-10-05',
      });

      expect(res.status).toBe(200);
      expect(res.body.activitiesImported).toBe(3);
      expect(startProviderSync).toHaveBeenCalledWith(
        { userId: USER, providerId: PROVIDER },
        expect.any(Function)
      );
      expect(intervalsService.syncIntervalsData).toHaveBeenCalledWith(
        USER,
        USER,
        PROVIDER,
        '2026-10-01',
        '2026-10-05',
        { dataSource: undefined, saveMockData: false }
      );
    });

    it('claims by provider type when no provider id is sent', async () => {
      vi.mocked(intervalsService.syncIntervalsData).mockResolvedValue({
        success: true,
        activitiesImported: 0,
        activitiesSkipped: 0,
        activitiesFailed: 0,
        activitiesRemoved: 0,
        wellnessDays: 0,
      });

      const res = await request(app).post('/integrations/intervals/sync');

      expect(res.status).toBe(200);
      expect(startProviderSync).toHaveBeenCalledWith(
        { userId: USER, providerType: 'intervals' },
        expect.any(Function)
      );
    });

    it('answers 409 while another sync holds the account', async () => {
      vi.mocked(startProviderSync).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/integrations/intervals/sync')
        .send({ providerId: PROVIDER });

      expect(res.status).toBe(409);
      expect(res.body).toEqual(SYNC_ALREADY_RUNNING_RESPONSE);
      expect(intervalsService.syncIntervalsData).not.toHaveBeenCalled();
    });

    it.each([
      [{ providerId: 'not-a-uuid' }, 'Invalid provider ID format'],
      [
        { startDate: '2026-02-30', endDate: '2026-03-01' },
        'Invalid calendar date',
      ],
      [
        { startDate: '2026-13-01', endDate: '2026-13-02' },
        'Invalid calendar date',
      ],
      [
        { startDate: '2020-01-01' },
        'startDate and endDate must be sent together',
      ],
      [
        { startDate: '2026-10-05', endDate: '2026-10-01' },
        'startDate must be before or equal to endDate',
      ],
      [
        { startDate: '2025-01-01', endDate: '2026-01-02' },
        'Date range cannot exceed 365 days.',
      ],
    ])('rejects %j with 400', async (body, error) => {
      const res = await request(app)
        .post('/integrations/intervals/sync')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(error);
      expect(startProviderSync).not.toHaveBeenCalled();
    });

    it('accepts exactly 365 days', async () => {
      vi.mocked(intervalsService.syncIntervalsData).mockResolvedValue({
        success: true,
        activitiesImported: 0,
        activitiesSkipped: 0,
        activitiesFailed: 0,
        activitiesRemoved: 0,
        wellnessDays: 0,
      });

      const res = await request(app)
        .post('/integrations/intervals/sync')
        .send({ startDate: '2025-01-01', endDate: '2026-01-01' });

      expect(res.status).toBe(200);
    });

    it('maps an Intervals auth failure to 401', async () => {
      vi.mocked(intervalsService.syncIntervalsData).mockRejectedValue({
        response: { status: 403 },
      });

      const res = await request(app).post('/integrations/intervals/sync');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('athlete ID or API key');
    });

    it('answers 500 on other failures', async () => {
      vi.mocked(intervalsService.syncIntervalsData).mockRejectedValue(
        new Error('network down')
      );

      const res = await request(app).post('/integrations/intervals/sync');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('network down');
    });
  });

  describe('GET /status', () => {
    it('returns the status', async () => {
      vi.mocked(intervalsService.getStatus).mockResolvedValue({
        connected: true,
        lastSyncAt: '2026-10-14T04:30:00.000Z',
      });

      const res = await request(app)
        .get('/integrations/intervals/status')
        .query({ providerId: PROVIDER });

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(intervalsService.getStatus).toHaveBeenCalledWith(USER, PROVIDER);
    });

    it('rejects an invalid provider id', async () => {
      const res = await request(app)
        .get('/integrations/intervals/status')
        .query({ providerId: 'nope' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /disconnect', () => {
    it('disconnects the provider', async () => {
      vi.mocked(intervalsService.disconnect).mockResolvedValue(true);

      const res = await request(app)
        .post('/integrations/intervals/disconnect')
        .send({ providerId: PROVIDER });

      expect(res.status).toBe(200);
      expect(intervalsService.disconnect).toHaveBeenCalledWith(USER, PROVIDER);
    });

    it('answers 404 when there is no provider', async () => {
      vi.mocked(intervalsService.disconnect).mockResolvedValue(false);

      const res = await request(app).post('/integrations/intervals/disconnect');

      expect(res.status).toBe(404);
    });
  });
});
