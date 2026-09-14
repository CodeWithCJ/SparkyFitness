import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import liftosaurRoutes from '../routes/liftosaurRoutes.js';
import liftosaurService from '../integrations/liftosaur/liftosaurService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: vi.fn((req: any, _res: any, next: any) => {
      req.userId = '11111111-1111-1111-1111-111111111111';
      next();
    }),
  },
}));

vi.mock('../integrations/liftosaur/liftosaurService.js', () => ({
  default: {
    syncLiftosaurData: vi.fn(),
    getStatus: vi.fn(),
    disconnect: vi.fn(),
  },
  liftosaurErrorReason: vi.fn((err: any) => {
    if (err?.status === 401) return { status: 401, code: 'unauthorized' };
    if (err?.status === 403 && err?.code === 'subscription_required') {
      return { status: 403, code: 'subscription_required' };
    }
    return { status: 500, code: 'unknown' };
  }),
}));

describe('liftosaurRoutes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/integrations/liftosaur', liftosaurRoutes);
  });

  describe('POST /integrations/liftosaur/sync', () => {
    it('returns 200 with valid body parameters', async () => {
      vi.mocked(liftosaurService.syncLiftosaurData).mockResolvedValue({
        success: true,
        processedCount: 5,
        parsedCount: 5,
        skippedCount: 0,
        workoutsImported: 5,
        workoutsExported: 0,
        measurementsImported: 0,
        measurementsExported: 0,
        source: 'live_api',
      });

      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({
          providerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          startDate: '2024-06-01',
          endDate: '2024-06-05',
          fullSync: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(liftosaurService.syncLiftosaurData).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111',
        false,
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        '2024-06-01',
        '2024-06-05'
      );
    });

    it('returns 400 when providerId is not a valid UUID', async () => {
      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({
          providerId: 'invalid-uuid',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid request body');
      expect(liftosaurService.syncLiftosaurData).not.toHaveBeenCalled();
    });

    it('returns 400 when startDate is an impossible calendar date (2024-02-31)', async () => {
      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({
          startDate: '2024-02-31',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid request body');
      expect(liftosaurService.syncLiftosaurData).not.toHaveBeenCalled();
    });

    it('returns 400 when startDate format is not YYYY-MM-DD', async () => {
      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({
          startDate: '06-01-2024',
        });

      expect(response.status).toBe(400);
      expect(liftosaurService.syncLiftosaurData).not.toHaveBeenCalled();
    });

    it('returns 400 when startDate is after endDate', async () => {
      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({
          startDate: '2024-06-10',
          endDate: '2024-06-05',
        });

      expect(response.status).toBe(400);
      expect(liftosaurService.syncLiftosaurData).not.toHaveBeenCalled();
    });

    it('returns 401 when service throws unauthorized error', async () => {
      const err = new Error('Invalid API key') as any;
      err.status = 401;
      vi.mocked(liftosaurService.syncLiftosaurData).mockRejectedValue(err);

      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid Liftosaur API key');
    });

    it('returns 403 when service throws subscription_required error', async () => {
      const err = new Error('Subscription required') as any;
      err.status = 403;
      err.code = 'subscription_required';
      vi.mocked(liftosaurService.syncLiftosaurData).mockRejectedValue(err);

      const response = await request(app)
        .post('/integrations/liftosaur/sync')
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.message).toContain(
        'Liftosaur account needs an active subscription'
      );
    });
  });

  describe('GET /integrations/liftosaur/status', () => {
    it('returns 200 with valid providerId query parameter', async () => {
      vi.mocked(liftosaurService.getStatus).mockResolvedValue({
        connected: true,
        lastSyncAt: null,
      });

      const response = await request(app).get(
        '/integrations/liftosaur/status?providerId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      );

      expect(response.status).toBe(200);
      expect(response.body.connected).toBe(true);
      expect(liftosaurService.getStatus).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      );
    });

    it('returns 400 when providerId query parameter is invalid UUID', async () => {
      const response = await request(app).get(
        '/integrations/liftosaur/status?providerId=bad-uuid'
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid query parameters');
    });
  });

  describe('POST /integrations/liftosaur/disconnect', () => {
    it('returns 200 on successful disconnect', async () => {
      vi.mocked(liftosaurService.disconnect).mockResolvedValue(true);

      const response = await request(app)
        .post('/integrations/liftosaur/disconnect')
        .send({
          providerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('disconnected successfully');
    });

    it('returns 400 when providerId is not a valid UUID', async () => {
      const response = await request(app)
        .post('/integrations/liftosaur/disconnect')
        .send({
          providerId: 'bad-uuid',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid request body');
    });

    it('returns 404 when provider is not found', async () => {
      vi.mocked(liftosaurService.disconnect).mockResolvedValue(false);

      const response = await request(app)
        .post('/integrations/liftosaur/disconnect')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });
  });
});
