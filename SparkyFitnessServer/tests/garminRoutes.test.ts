import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import garminRoutes, {
  MFA_ATTEMPT_MAX,
  mfaAttemptLimiter,
} from '../routes/garminRoutes.js';
import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import garminService from '../services/garminService.js';
import externalProviderRepository from '../models/externalProviderRepository.js';

// Toggle used by the mocked permission middleware so a test can assert the 403
// path (a switched-context delegate lacking diary access). The real middleware
// logic is covered by checkPermissionMiddleware.test.ts.
const { permissionState } = vi.hoisted(() => ({
  permissionState: { allow: true },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(
    () => (_req: any, res: any, next: any) =>
      permissionState.allow
        ? next()
        : res.status(403).json({ error: 'Forbidden' })
  ),
}));

vi.mock('../integrations/garminconnect/garminConnectService.js', () => ({
  default: {
    garminLogin: vi.fn(),
    garminResumeLogin: vi.fn(),
    handleGarminTokens: vi.fn(),
    syncGarminHealthAndWellness: vi.fn(),
    fetchGarminActivitiesAndWorkouts: vi.fn(),
    fetchGarminNutritionDiary: vi.fn(),
    checkGarminMicroserviceHealth: vi.fn(),
  },
}));

vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    getExternalDataProviderByUserIdAndProviderName: vi.fn(),
    updateProviderLastSync: vi.fn(),
  },
}));

vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn(),
  },
}));

vi.mock('../services/garminService.js', () => ({
  default: {
    processGarminHealthAndWellnessData: vi.fn(),
    processActivitiesAndWorkouts: vi.fn(),
    processGarminNutritionData: vi.fn(),
    syncGarminData: vi.fn(),
  },
}));

vi.mock('../integrations/garminconnect/garminMeasurementMapping.js', () => ({
  default: {},
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/globalSettingsRepository.js', () => ({
  // The mock-data options are off unless an admin turned them on; these route
  // tests exercise the normal path, so the options never reach the service.
  isMockDataEnabled: vi.fn().mockResolvedValue(false),
}));

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
app.use('/integrations/garmin', garminRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

beforeEach(() => {
  vi.clearAllMocks();
  mfaAttemptLimiter.reset();
  permissionState.allow = true;
  (
    externalProviderRepository.getExternalDataProviderByUserIdAndProviderName as any
  ).mockResolvedValue({ id: 'provider-1' });
  (externalProviderRepository.updateProviderLastSync as any).mockResolvedValue(
    true
  );
});

describe('permission gating (switched-context delegate without diary access)', () => {
  it('returns 403 from /sync and does not run the sync', async () => {
    permissionState.allow = false;
    const res = await request(app)
      .post('/integrations/garmin/sync')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });
    expect(res.statusCode).toBe(403);
    expect(garminService.syncGarminData).not.toHaveBeenCalled();
  });

  it('returns 403 from /sync/nutrition_diary and does not fetch nutrition', async () => {
    permissionState.allow = false;
    const res = await request(app)
      .post('/integrations/garmin/sync/nutrition_diary')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });
    expect(res.statusCode).toBe(403);
    expect(garminService.processGarminNutritionData).not.toHaveBeenCalled();
  });

  it('returns 403 from /unlink and does not delete the provider', async () => {
    permissionState.allow = false;
    const res = await request(app).post('/integrations/garmin/unlink');
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /integrations/garmin/resume_login', () => {
  it('stops forwarding codes once the attempt cap is reached', async () => {
    vi.mocked(garminConnectService.garminResumeLogin).mockResolvedValue({
      status: 'invalid_mfa_code',
    });
    const attempt = () =>
      request(app)
        .post('/integrations/garmin/resume_login')
        .send({ client_state: 'sealed', mfa_code: '123456' });

    for (let i = 0; i < MFA_ATTEMPT_MAX; i++) {
      expect((await attempt()).statusCode).toBe(200);
    }
    const res = await attempt();

    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(garminConnectService.garminResumeLogin).toHaveBeenCalledTimes(
      MFA_ATTEMPT_MAX
    );
  });
});

describe('POST /integrations/garmin/sync', () => {
  it('answers 409 without syncing while another sync holds the account', async () => {
    vi.mocked(startProviderSync).mockResolvedValueOnce(null);

    const res = await request(app).post('/integrations/garmin/sync').send({});

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual(SYNC_ALREADY_RUNNING_RESPONSE);
    expect(startProviderSync).toHaveBeenCalledWith(
      { userId: 'user-123', providerType: 'garmin' },
      expect.any(Function)
    );
    expect(garminService.syncGarminData).not.toHaveBeenCalled();
  });

  it('updates provider last_sync_at when all sync phases complete', async () => {
    const result = {
      health: { processedEntries: 1 },
      activities: { processedEntries: 2 },
      nutrition: { processedEntries: 3 },
    };
    (garminService.syncGarminData as any).mockResolvedValue(result);

    const res = await request(app)
      .post('/integrations/garmin/sync')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ...result,
      failedPhases: [],
      serviceUnreachable: false,
    });
    expect(garminService.syncGarminData).toHaveBeenCalledWith(
      'user-123',
      'manual',
      '2026-06-01',
      '2026-06-07',
      undefined,
      false
    );
    expect(
      externalProviderRepository.updateProviderLastSync
    ).toHaveBeenCalledWith('provider-1', expect.any(Date));
  });

  it('does not update provider last_sync_at when a sync phase returns an error', async () => {
    const result = {
      health: { error: 'Garmin health API rate limited' },
      activities: { processedEntries: 2 },
      nutrition: { processedEntries: 3 },
    };
    (garminService.syncGarminData as any).mockResolvedValue(result);

    const res = await request(app)
      .post('/integrations/garmin/sync')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ...result,
      failedPhases: ['health'],
      serviceUnreachable: false,
    });
    expect(
      externalProviderRepository.updateProviderLastSync
    ).not.toHaveBeenCalled();
  });

  it('flags an unreachable Garmin microservice and still answers 200', async () => {
    (garminService.syncGarminData as any).mockResolvedValue({
      health: {
        error:
          '[2026-06-01..2026-06-07]: Failed to fetch Garmin health and wellness chunk (2026-06-01 to 2026-06-07): connect ECONNREFUSED 127.0.0.1:8000',
      },
      activities: {
        processedEntries: 0,
        partialErrors: ['[2026-06-01..2026-06-07]: ENOTFOUND'],
      },
      nutrition: { processedEntries: 3 },
    });

    const res = await request(app)
      .post('/integrations/garmin/sync')
      .send({ startDate: '2026-06-01', endDate: '2026-06-07' });

    expect(res.statusCode).toBe(200);
    expect(res.body.failedPhases).toEqual(['health', 'activities']);
    expect(res.body.serviceUnreachable).toBe(true);
  });
});

describe('GET /integrations/garmin/status', () => {
  const provider = {
    id: 'provider-1',
    updated_at: '2026-06-08T10:00:00.000Z',
    last_sync_at: '2026-06-07T09:00:00.000Z',
    token_expires_at: '2026-06-09T10:00:00.000Z',
  };

  it.each([true, false])(
    'returns lastSyncAt and serviceReachable=%s for a linked account',
    async (reachable) => {
      (
        externalProviderRepository.getExternalDataProviderByUserIdAndProviderName as any
      ).mockResolvedValue(provider);
      vi.mocked(
        garminConnectService.checkGarminMicroserviceHealth
      ).mockResolvedValue(reachable);

      const res = await request(app).get('/integrations/garmin/status');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        isLinked: true,
        lastUpdated: provider.updated_at,
        lastSyncAt: provider.last_sync_at,
        tokenExpiresAt: provider.token_expires_at,
        serviceReachable: reachable,
        message: 'Garmin Connect is linked.',
      });
    }
  );

  it('returns lastSyncAt null when the account never synced', async () => {
    (
      externalProviderRepository.getExternalDataProviderByUserIdAndProviderName as any
    ).mockResolvedValue({ ...provider, last_sync_at: null });
    vi.mocked(
      garminConnectService.checkGarminMicroserviceHealth
    ).mockResolvedValue(true);

    const res = await request(app).get('/integrations/garmin/status');

    expect(res.body.lastSyncAt).toBeNull();
  });

  it('does not check the microservice without a linked account', async () => {
    (
      externalProviderRepository.getExternalDataProviderByUserIdAndProviderName as any
    ).mockResolvedValue(null);

    const res = await request(app).get('/integrations/garmin/status');

    expect(res.body).toEqual({
      isLinked: false,
      message: 'Garmin Connect is not linked.',
    });
    expect(
      garminConnectService.checkGarminMicroserviceHealth
    ).not.toHaveBeenCalled();
  });
});
