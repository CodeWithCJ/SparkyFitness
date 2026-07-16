import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): no types for supertest
import request from 'supertest';
import express from 'express';

// Happy-path and validation coverage for the Oura integration router.
// The permission gate itself is covered in integrationRoutesPermissionGating.test.ts.

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: (req: any, _res: any, next: any) => {
      req.userId = 'user-1';
      next();
    },
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/oura/ouraService.js', () => ({
  default: {
    getAuthorizationUrl: vi
      .fn()
      .mockResolvedValue('https://cloud.ouraring.com/oauth/authorize?x=1'),
    exchangeCodeForTokens: vi
      .fn()
      .mockResolvedValue({ success: true, externalUserId: 'oura-user-1' }),
  },
}));
vi.mock('../services/ouraService.js', () => ({
  default: {
    syncOuraData: vi
      .fn()
      .mockResolvedValue({ success: true, source: 'live_api' }),
    disconnectOura: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      connected: true,
      isActive: true,
      lastSyncAt: '2026-07-16T00:00:00.000Z',
    }),
  },
}));

import ouraRoutes from '../routes/ouraRoutes.js';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraService from '../services/ouraService.js';

const app = express();
app.use(express.json());
app.use('/oura', ouraRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /oura/authorize', () => {
  it('returns the authorization URL', async () => {
    const res = await request(app).get('/oura/authorize');
    expect(res.statusCode).toBe(200);
    expect(res.body.authUrl).toContain('cloud.ouraring.com');
    expect(ouraIntegrationService.getAuthorizationUrl).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('/oura/callback')
    );
  });
});

describe('POST /oura/callback', () => {
  it('exchanges the code and reports success', async () => {
    const res = await request(app)
      .post('/oura/callback')
      .send({ code: 'auth-code-1' });
    expect(res.statusCode).toBe(200);
    expect(ouraIntegrationService.exchangeCodeForTokens).toHaveBeenCalledWith(
      'user-1',
      'auth-code-1',
      expect.stringContaining('/oura/callback')
    );
  });

  it('rejects a missing code with 400', async () => {
    const res = await request(app).post('/oura/callback').send({});
    expect(res.statusCode).toBe(400);
    expect(ouraIntegrationService.exchangeCodeForTokens).not.toHaveBeenCalled();
  });
});

describe('POST /oura/sync', () => {
  it('triggers a manual sync with a custom date range', async () => {
    const res = await request(app)
      .post('/oura/sync')
      .send({ startDate: '2026-07-01', endDate: '2026-07-10' });
    expect(res.statusCode).toBe(200);
    expect(ouraService.syncOuraData).toHaveBeenCalledWith(
      'user-1',
      'manual',
      '2026-07-01',
      '2026-07-10'
    );
  });

  it('triggers a manual sync without dates', async () => {
    const res = await request(app).post('/oura/sync').send({});
    expect(res.statusCode).toBe(200);
    expect(ouraService.syncOuraData).toHaveBeenCalledWith(
      'user-1',
      'manual',
      undefined,
      undefined
    );
  });

  it('rejects malformed dates with 400', async () => {
    const res = await request(app)
      .post('/oura/sync')
      .send({ startDate: 'not-a-date' });
    expect(res.statusCode).toBe(400);
    expect(ouraService.syncOuraData).not.toHaveBeenCalled();
  });

  it('returns 500 when the sync fails', async () => {
    vi.mocked(ouraService.syncOuraData).mockRejectedValueOnce(
      new Error('boom')
    );
    const res = await request(app).post('/oura/sync').send({});
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /oura/disconnect', () => {
  it('disconnects the account', async () => {
    const res = await request(app).post('/oura/disconnect').send({});
    expect(res.statusCode).toBe(200);
    expect(ouraService.disconnectOura).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /oura/status', () => {
  it('returns the connection status', async () => {
    const res = await request(app).get('/oura/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(ouraService.getStatus).toHaveBeenCalledWith('user-1');
  });
});
