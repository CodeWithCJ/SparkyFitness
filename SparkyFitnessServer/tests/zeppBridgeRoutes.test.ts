import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import zeppBridgeRoutes from '../routes/zeppBridgeRoutes.js';
import zeppBridgeService from '../integrations/zeppbridge/zeppBridgeService.js';
import { ZeppBridgeError } from '../integrations/zeppbridge/zeppBridgeClient.js';

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
vi.mock('../middleware/requireSelfMiddleware.js', () => ({
  default: (_req: express.Request, _res: express.Response, next: () => void) =>
    next(),
}));
vi.mock('../integrations/zeppbridge/zeppBridgeService.js', () => ({
  default: {
    syncZeppBridgeData: vi.fn(),
    testZeppBridge: vi.fn(),
    getStatus: vi.fn(),
    disconnect: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/providerSyncClaim.js', async (importActual) => ({
  ...(await importActual<typeof import('../services/providerSyncClaim.js')>()),
  startProviderSync: vi.fn(async (_target, sync) => ({ running: sync() })),
}));
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  startProviderSync,
} from '../services/providerSyncClaim.js';

describe('zeppBridgeRoutes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/integrations/zeppbridge', zeppBridgeRoutes);
  });

  describe('POST /sync', () => {
    it('syncs the requested range under the provider claim', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockResolvedValue({
        success: true,
        sleepImported: 4,
        workoutsImported: 2,
        workoutDetailsImported: 1,
        workoutDetailsFailed: 0,
        failed: 0,
        metricDays: 6,
        recordsSkipped: 0,
      });

      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({
          providerId: PROVIDER,
          startDate: '2026-11-01',
          endDate: '2026-11-05',
        });

      expect(res.status).toBe(200);
      expect(res.body.sleepImported).toBe(4);
      expect(startProviderSync).toHaveBeenCalledWith(
        { userId: USER, providerId: PROVIDER },
        expect.any(Function)
      );
      expect(zeppBridgeService.syncZeppBridgeData).toHaveBeenCalledWith(
        USER,
        USER,
        PROVIDER,
        '2026-11-01',
        '2026-11-05'
      );
    });

    it.each([
      [{ startDate: '2026-11-01' }, 'sent together'],
      [{ startDate: '2026-11-05', endDate: '2026-11-01' }, 'before or equal'],
      [{ startDate: '2026-13-01', endDate: '2026-13-02' }, 'Invalid calendar'],
      [{ startDate: '2025-01-01', endDate: '2026-11-01' }, 'cannot exceed'],
      [{ providerId: 'nope' }, 'Invalid provider ID'],
    ])('rejects %j', async (body, message) => {
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(message);
      expect(zeppBridgeService.syncZeppBridgeData).not.toHaveBeenCalled();
    });

    it('answers 409 while a sync is already running', async () => {
      vi.mocked(startProviderSync).mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(409);
      expect(res.body).toEqual(SYNC_ALREADY_RUNNING_RESPONSE);
    });

    it('answers 401 when ZeppBridge rejects the pull token', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockRejectedValue(
        new ZeppBridgeError('Missing or wrong token', 401, 'unauthorized')
      );
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('pull token');
    });

    it('answers 502 when ZeppBridge cannot be reached', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockRejectedValue(
        new ZeppBridgeError('Could not reach ZeppBridge: ECONNREFUSED', 0)
      );
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('ECONNREFUSED');
    });

    it('answers 404 when the provider does not exist', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockRejectedValue(
        new ZeppBridgeError(
          'ZeppBridge provider not found.',
          404,
          'provider_not_found'
        )
      );
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(404);
    });

    it('answers 502, not 404, when the ZeppBridge server itself returns 404', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockRejectedValue(
        new ZeppBridgeError('not found', 404, 'not_found')
      );
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(502);
    });

    it('does not leak internal errors in a 500', async () => {
      vi.mocked(zeppBridgeService.syncZeppBridgeData).mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
          code: 'ECONNREFUSED',
          errno: -61,
          syscall: 'connect',
        })
      );
      const res = await request(app)
        .post('/integrations/zeppbridge/sync')
        .send({});
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    });
  });

  describe('POST /test', () => {
    it('returns the ZeppBridge version', async () => {
      vi.mocked(zeppBridgeService.testZeppBridge).mockResolvedValue({
        version: '3.2.1',
        recordsVersion: 'zeppbridge.records.v2',
      });
      const res = await request(app)
        .post('/integrations/zeppbridge/test')
        .send({ providerId: PROVIDER });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        version: '3.2.1',
        recordsVersion: 'zeppbridge.records.v2',
      });
      expect(zeppBridgeService.testZeppBridge).toHaveBeenCalledWith(
        USER,
        PROVIDER
      );
    });
  });

  describe('GET /status and POST /disconnect', () => {
    it('reports the status', async () => {
      vi.mocked(zeppBridgeService.getStatus).mockResolvedValue({
        connected: true,
        lastSyncAt: '2026-11-21T10:00:00.000Z',
      });
      const res = await request(app).get(
        `/integrations/zeppbridge/status?providerId=${PROVIDER}`
      );
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(zeppBridgeService.getStatus).toHaveBeenCalledWith(USER, PROVIDER);
    });

    it('disconnects, and answers 404 without a provider', async () => {
      vi.mocked(zeppBridgeService.disconnect).mockResolvedValueOnce(true);
      expect(
        (
          await request(app)
            .post('/integrations/zeppbridge/disconnect')
            .send({})
        ).status
      ).toBe(200);

      vi.mocked(zeppBridgeService.disconnect).mockResolvedValueOnce(false);
      expect(
        (
          await request(app)
            .post('/integrations/zeppbridge/disconnect')
            .send({})
        ).status
      ).toBe(404);
    });
  });
});
