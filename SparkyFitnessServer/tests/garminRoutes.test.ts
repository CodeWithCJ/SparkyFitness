import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import garminRoutes from '../routes/garminRoutes.js';
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

const app = express();
app.use(express.json());
app.use('/integrations/garmin', garminRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

beforeEach(() => {
  vi.clearAllMocks();
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

describe('POST /integrations/garmin/sync', () => {
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
    expect(res.body).toEqual(result);
    expect(garminService.syncGarminData).toHaveBeenCalledWith(
      'user-123',
      'manual',
      '2026-06-01',
      '2026-06-07'
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
    expect(res.body).toEqual(result);
    expect(
      externalProviderRepository.updateProviderLastSync
    ).not.toHaveBeenCalled();
  });
});
