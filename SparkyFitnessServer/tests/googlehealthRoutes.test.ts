import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import googleHealthRoutes from '../routes/googleHealthRoutes.js';

vi.mock('../integrations/googlehealth/googleHealthService.js', () => ({
  default: {
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
  },
}));

vi.mock('../services/googleHealthService.js', () => ({
  default: {
    syncGoogleHealthData: vi.fn(),
    disconnectGoogleHealth: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authenticate: (req: any, _res: any, next: any) => {
      req.userId = 'test-user-id';
      next();
    },
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import googleHealthService from '../services/googleHealthService.js';

const app = express();
app.use(express.json());
app.use('/api/integrations/googlehealth', googleHealthRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/integrations/googlehealth/authorize', () => {
  it('returns an authUrl on success', async () => {
    // @ts-expect-error TS(2339)
    googleHealthIntegrationService.getAuthorizationUrl.mockResolvedValue(
      'https://accounts.google.com/o/oauth2?...'
    );

    const res = await request(app).get(
      '/api/integrations/googlehealth/authorize'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('authUrl');
    expect(
      googleHealthIntegrationService.getAuthorizationUrl
    ).toHaveBeenCalledWith(
      'test-user-id',
      expect.stringContaining('/googlehealth/callback')
    );
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error TS(2339)
    googleHealthIntegrationService.getAuthorizationUrl.mockRejectedValue(
      new Error('DB error')
    );

    const res = await request(app).get(
      '/api/integrations/googlehealth/authorize'
    );

    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/integrations/googlehealth/callback', () => {
  it('returns 200 on successful token exchange', async () => {
    // @ts-expect-error TS(2339)
    googleHealthIntegrationService.exchangeCodeForTokens.mockResolvedValue({
      success: true,
    });

    const res = await request(app)
      .post('/api/integrations/googlehealth/callback')
      .send({ code: 'auth-code-abc' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty(
      'message',
      'Google Health account linked successfully.'
    );
    expect(
      googleHealthIntegrationService.exchangeCodeForTokens
    ).toHaveBeenCalledWith(
      'test-user-id',
      'auth-code-abc',
      expect.stringContaining('/googlehealth/callback')
    );
  });

  it('returns 500 when token exchange fails', async () => {
    // @ts-expect-error TS(2339)
    googleHealthIntegrationService.exchangeCodeForTokens.mockResolvedValue({
      success: false,
    });

    const res = await request(app)
      .post('/api/integrations/googlehealth/callback')
      .send({ code: 'bad-code' });

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty(
      'message',
      'Failed to connect Google Health account.'
    );
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(app)
      .post('/api/integrations/googlehealth/callback')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid request body');
    expect(
      googleHealthIntegrationService.exchangeCodeForTokens
    ).not.toHaveBeenCalled();
  });

  it('returns 400 when code is not a string', async () => {
    const res = await request(app)
      .post('/api/integrations/googlehealth/callback')
      .send({ code: 123 });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid request body');
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error TS(2339)
    googleHealthIntegrationService.exchangeCodeForTokens.mockRejectedValue(
      new Error('OAuth error')
    );

    const res = await request(app)
      .post('/api/integrations/googlehealth/callback')
      .send({ code: 'auth-code-abc' });

    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/integrations/googlehealth/sync', () => {
  it('returns 202 on successful sync without dates', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.syncGoogleHealthData.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/integrations/googlehealth/sync')
      .send({});

    expect(res.statusCode).toBe(202);
    expect(res.body).toHaveProperty('message', 'Google Health sync started.');
    expect(googleHealthService.syncGoogleHealthData).toHaveBeenCalledWith(
      'test-user-id',
      'manual',
      undefined,
      undefined
    );
  });

  it('passes startDate and endDate to the service when provided', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.syncGoogleHealthData.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/integrations/googlehealth/sync')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });

    expect(res.statusCode).toBe(202);
    expect(googleHealthService.syncGoogleHealthData).toHaveBeenCalledWith(
      'test-user-id',
      'manual',
      '2026-06-01',
      '2026-06-07'
    );
  });

  it('returns 400 when startDate format is invalid', async () => {
    const res = await request(app)
      .post('/api/integrations/googlehealth/sync')
      .send({ startDate: 'not-a-date' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid request body');
    expect(googleHealthService.syncGoogleHealthData).not.toHaveBeenCalled();
  });

  it('returns 202 even when service throws (fire-and-forget)', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.syncGoogleHealthData.mockRejectedValue(
      new Error('Sync error')
    );

    const res = await request(app)
      .post('/api/integrations/googlehealth/sync')
      .send({});

    expect(res.statusCode).toBe(202);
    expect(res.body).toHaveProperty('message', 'Google Health sync started.');
  });
});

describe('POST /api/integrations/googlehealth/disconnect', () => {
  it('returns 200 on successful disconnect', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.disconnectGoogleHealth.mockResolvedValue(undefined);

    const res = await request(app).post(
      '/api/integrations/googlehealth/disconnect'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty(
      'message',
      'Google Health account disconnected successfully.'
    );
    expect(googleHealthService.disconnectGoogleHealth).toHaveBeenCalledWith(
      'test-user-id'
    );
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.disconnectGoogleHealth.mockRejectedValue(
      new Error('DB error')
    );

    const res = await request(app).post(
      '/api/integrations/googlehealth/disconnect'
    );

    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/integrations/googlehealth/status', () => {
  it('returns status object on success', async () => {
    const mockStatus = {
      is_linked: true,
      is_active: true,
      last_sync_at: '2026-06-07T10:00:00Z',
    };
    // @ts-expect-error TS(2339)
    googleHealthService.getStatus.mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/integrations/googlehealth/status');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(mockStatus);
    expect(googleHealthService.getStatus).toHaveBeenCalledWith('test-user-id');
  });

  it('returns 500 when service throws', async () => {
    // @ts-expect-error TS(2339)
    googleHealthService.getStatus.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/integrations/googlehealth/status');

    expect(res.statusCode).toBe(500);
  });
});
