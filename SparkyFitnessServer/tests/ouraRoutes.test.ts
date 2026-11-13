import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../models/globalSettingsRepository.js', () => ({
  // The mock-data options are off unless an admin turned them on; these route
  // tests exercise the normal path, so the options never reach the service.
  isMockDataEnabled: vi.fn().mockResolvedValue(false),
}));

import ouraRoutes, { getOuraRedirectUri } from '../routes/ouraRoutes.js';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraService from '../services/ouraService.js';

vi.mock('../services/providerSyncClaim.js', async (importActual) => ({
  ...(await importActual<typeof import('../services/providerSyncClaim.js')>()),
  startProviderSync: vi.fn(async (_target, sync) => ({ running: sync() })),
}));
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  startProviderSync,
} from '../services/providerSyncClaim.js';

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

  it('honors a valid client-provided redirect_uri', async () => {
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS = 'http://localhost:8080';
    const res = await request(app)
      .get('/oura/authorize?redirect_uri=http://localhost:8080/oura/callback')
      .set('Origin', 'http://localhost:8080');
    expect(res.statusCode).toBe(200);
    expect(ouraIntegrationService.getAuthorizationUrl).toHaveBeenCalledWith(
      'user-1',
      'http://localhost:8080/oura/callback'
    );
  });

  it('falls back to default if client provides an untrusted redirect_uri', async () => {
    const res = await request(app)
      .get('/oura/authorize?redirect_uri=https://untrusted.test/oura/callback')
      .set('Origin', 'https://untrusted.test');
    expect(res.statusCode).toBe(200);
    expect(ouraIntegrationService.getAuthorizationUrl).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('/oura/callback')
    );
    expect(ouraIntegrationService.getAuthorizationUrl).not.toHaveBeenCalledWith(
      'user-1',
      'https://untrusted.test/oura/callback'
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

  it('honors a client-provided redirect_uri in callback', async () => {
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS = 'http://localhost:8080';
    const res = await request(app).post('/oura/callback').send({
      code: 'auth-code-1',
      redirect_uri: 'http://localhost:8080/oura/callback',
    });
    expect(res.statusCode).toBe(200);
    expect(ouraIntegrationService.exchangeCodeForTokens).toHaveBeenCalledWith(
      'user-1',
      'auth-code-1',
      'http://localhost:8080/oura/callback'
    );
  });

  it('rejects a missing code with 400', async () => {
    const res = await request(app).post('/oura/callback').send({});
    expect(res.statusCode).toBe(400);
    expect(ouraIntegrationService.exchangeCodeForTokens).not.toHaveBeenCalled();
  });
});

describe('getOuraRedirectUri helper', () => {
  const origFrontendUrl = process.env.SPARKY_FITNESS_FRONTEND_URL;
  const origExtraOrigins = process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS;

  beforeEach(() => {
    process.env.SPARKY_FITNESS_FRONTEND_URL = 'https://sparky.test/';
    delete process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS;
  });

  afterAll(() => {
    process.env.SPARKY_FITNESS_FRONTEND_URL = origFrontendUrl;
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS = origExtraOrigins;
  });

  it('strips trailing slashes from default base URL', () => {
    expect(getOuraRedirectUri()).toBe('https://sparky.test/oura/callback');
  });

  it('falls back to default if client-provided redirect_uri origin is untrusted', () => {
    expect(getOuraRedirectUri('http://localhost:3000/oura/callback')).toBe(
      'https://sparky.test/oura/callback'
    );
    expect(getOuraRedirectUri('https://untrusted.test/oura/callback')).toBe(
      'https://sparky.test/oura/callback'
    );
  });

  it('uses client-provided redirect_uri when origin is in SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS', () => {
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS =
      'https://alt.sparky.test, http://localhost:3000/';
    expect(getOuraRedirectUri('https://alt.sparky.test/oura/callback')).toBe(
      'https://alt.sparky.test/oura/callback'
    );
    expect(getOuraRedirectUri('http://localhost:3000/oura/callback')).toBe(
      'http://localhost:3000/oura/callback'
    );
  });

  it('uses client-provided redirect_uri when origin matches default frontend URL', () => {
    expect(getOuraRedirectUri('https://sparky.test/oura/callback')).toBe(
      'https://sparky.test/oura/callback'
    );
  });

  it('falls back to default if path is not /oura/callback', () => {
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS =
      'https://alt.sparky.test';
    expect(
      getOuraRedirectUri('https://alt.sparky.test/malicious/callback')
    ).toBe('https://sparky.test/oura/callback');
  });

  it('falls back to default if protocol is not http or https', () => {
    process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS =
      'https://alt.sparky.test';
    expect(getOuraRedirectUri('foo://alt.sparky.test/oura/callback')).toBe(
      'https://sparky.test/oura/callback'
    );
  });
});

describe('POST /oura/sync', () => {
  it('answers 409 without syncing while another sync holds the account', async () => {
    vi.mocked(startProviderSync).mockResolvedValueOnce(null);

    const res = await request(app).post('/oura/sync').send({});

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual(SYNC_ALREADY_RUNNING_RESPONSE);
    expect(startProviderSync).toHaveBeenCalledWith(
      { userId: 'user-1', providerType: 'oura' },
      expect.any(Function)
    );
    expect(ouraService.syncOuraData).not.toHaveBeenCalled();
  });

  it('triggers a manual sync with a custom date range', async () => {
    const res = await request(app)
      .post('/oura/sync')
      .send({ startDate: '2026-07-01', endDate: '2026-07-10' });
    expect(res.statusCode).toBe(200);
    expect(ouraService.syncOuraData).toHaveBeenCalledWith(
      'user-1',
      'manual',
      '2026-07-01',
      '2026-07-10',
      undefined,
      false
    );
  });

  it('triggers a manual sync without dates', async () => {
    const res = await request(app).post('/oura/sync').send({});
    expect(res.statusCode).toBe(200);
    expect(ouraService.syncOuraData).toHaveBeenCalledWith(
      'user-1',
      'manual',
      undefined,
      undefined,
      undefined,
      false
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
