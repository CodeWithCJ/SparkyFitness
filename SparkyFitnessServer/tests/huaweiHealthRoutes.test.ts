import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import huaweiHealthRoutes from '../routes/huaweiHealthRoutes.js';
import huaweiHealthOAuthService from '../integrations/huaweihealth/huaweiHealthOAuthService.js';
import huaweiHealthSyncService from '../integrations/huaweihealth/huaweiHealthSyncService.js';
import { HuaweiHealthError } from '../integrations/huaweihealth/huaweiHealthErrors.js';

vi.mock('../integrations/huaweihealth/huaweiHealthOAuthService.js', () => ({
  default: {
    createAuthorizationRequest: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    getStatus: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../integrations/huaweihealth/huaweiHealthSyncService.js', () => ({
  default: { sync: vi.fn() },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: (req: any, _res: any, next: any) => {
      req.userId = 'user-1';
      req.authenticatedUserId = 'user-1';
      next();
    },
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/api/integrations/huaweihealth', huaweiHealthRoutes);

describe('Huawei Health routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the server-generated authorization URL', async () => {
    vi.mocked(
      huaweiHealthOAuthService.createAuthorizationRequest
    ).mockResolvedValue({ authUrl: 'https://oauth.example/authorize' });

    const response = await request(app).get(
      '/api/integrations/huaweihealth/authorize'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      authUrl: 'https://oauth.example/authorize',
    });
    expect(
      huaweiHealthOAuthService.createAuthorizationRequest
    ).toHaveBeenCalledWith('user-1', 'user-1');
  });

  it('requires both authorization code and opaque state on callback', async () => {
    const response = await request(app)
      .post('/api/integrations/huaweihealth/callback')
      .send({ code: 'authorization-code' });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'HUAWEI_CALLBACK_INVALID' },
    });
    expect(
      huaweiHealthOAuthService.exchangeCodeForTokens
    ).not.toHaveBeenCalled();
  });

  it('exchanges a valid callback without returning tokens to the browser', async () => {
    vi.mocked(huaweiHealthOAuthService.exchangeCodeForTokens).mockResolvedValue(
      { connected: true }
    );
    const state = 'a'.repeat(64);

    const response = await request(app)
      .post('/api/integrations/huaweihealth/callback')
      .send({ code: 'authorization-code', state });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ connected: true });
    expect(huaweiHealthOAuthService.exchangeCodeForTokens).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'authorization-code',
      state
    );
  });

  it('returns stable integration error codes without provider details', async () => {
    vi.mocked(
      huaweiHealthOAuthService.createAuthorizationRequest
    ).mockRejectedValue(
      new HuaweiHealthError(
        'HUAWEI_NOT_CONFIGURED',
        503,
        'secret provider detail'
      )
    );

    const response = await request(app).get(
      '/api/integrations/huaweihealth/authorize'
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: { code: 'HUAWEI_NOT_CONFIGURED' },
    });
    expect(response.text).not.toContain('secret provider detail');
  });

  it('returns status and disconnects using the authenticated owner context', async () => {
    vi.mocked(huaweiHealthOAuthService.getStatus).mockResolvedValue({
      available: true,
      connected: false,
      isActive: false,
      lastSyncAt: null,
      tokenExpiresAt: null,
      grantedScopes: [],
    });
    vi.mocked(huaweiHealthOAuthService.disconnect).mockResolvedValue(undefined);

    const statusResponse = await request(app).get(
      '/api/integrations/huaweihealth/status'
    );
    const disconnectResponse = await request(app).post(
      '/api/integrations/huaweihealth/disconnect'
    );

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body).toMatchObject({
      available: true,
      connected: false,
    });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.body).toEqual({ connected: false });
    expect(huaweiHealthOAuthService.getStatus).toHaveBeenCalledWith(
      'user-1',
      'user-1'
    );
    expect(huaweiHealthOAuthService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'user-1'
    );
  });

  it('runs a bounded manual sync and returns its partial-scope summary', async () => {
    vi.mocked(huaweiHealthSyncService.sync).mockResolvedValue({
      status: 'completed',
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      processed: 12,
      errors: 0,
      skipped: 1,
      missingScopes: ['https://www.huawei.com/healthkit/sleep.read'],
      completedAt: new Date('2026-07-10T12:00:00.000Z'),
    });

    const response = await request(app)
      .post('/api/integrations/huaweihealth/sync')
      .send({ startDate: '2026-07-01', endDate: '2026-07-07' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'completed',
      processed: 12,
      missingScopes: ['https://www.huawei.com/healthkit/sleep.read'],
    });
    expect(huaweiHealthSyncService.sync).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      { startDate: '2026-07-01', endDate: '2026-07-07' }
    );
  });

  it('rejects incomplete, reversed, and over-31-day manual ranges', async () => {
    for (const body of [
      { startDate: '2026-07-01' },
      { startDate: '2026-07-08', endDate: '2026-07-01' },
      { startDate: '2026-05-01', endDate: '2026-07-01' },
    ]) {
      const response = await request(app)
        .post('/api/integrations/huaweihealth/sync')
        .send(body);
      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'HUAWEI_SYNC_INVALID' },
      });
    }
    expect(huaweiHealthSyncService.sync).not.toHaveBeenCalled();
  });
});
