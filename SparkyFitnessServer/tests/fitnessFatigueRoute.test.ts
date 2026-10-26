import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import {
  fitnessFatigueResponseSchema,
  runningEstimatesResponseSchema,
} from '@workspace/shared';

const { getFitnessFatigue, getRunningEstimates, canAccessUserData } =
  vi.hoisted(() => ({
    getFitnessFatigue: vi.fn(),
    getRunningEstimates: vi.fn(),
    canAccessUserData: vi.fn(),
  }));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));
vi.mock('../services/reportService.js', () => ({
  default: { getFitnessFatigue, getRunningEstimates },
}));
vi.mock('../utils/permissionUtils.js', () => ({ canAccessUserData }));

import reportRoutes from '../routes/reportRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const point = {
  day: '2026-10-13',
  load: 80,
  fitness: 42.5,
  fatigue: 51.2,
  form: -8.7,
};
const body = {
  fitnessFatigue: { points: [point], today: point, status: 'tired' },
  readiness: {
    score: 48,
    level: 'moderate',
    factors: { form: 35, sleep: 62 },
    weakest: 'form',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  canAccessUserData.mockResolvedValue(true);
});

describe('GET /api/reports/fitness-fatigue', () => {
  it("returns the curve and readiness for the acting user's own data", async () => {
    getFitnessFatigue.mockResolvedValue(body);
    const res = await request(app).get('/api/reports/fitness-fatigue');
    expect(res.status).toBe(200);
    expect(fitnessFatigueResponseSchema.safeParse(res.body).success).toBe(true);
    expect(getFitnessFatigue).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
    expect(canAccessUserData).not.toHaveBeenCalled();
  });

  it('checks the reports permission before reading another user', async () => {
    getFitnessFatigue.mockResolvedValue(body);
    const res = await request(app).get(
      '/api/reports/fitness-fatigue?userId=other-user'
    );
    expect(res.status).toBe(200);
    expect(canAccessUserData).toHaveBeenCalledWith(
      'other-user',
      'reports',
      'test-user-id'
    );
    expect(getFitnessFatigue).toHaveBeenCalledWith(
      'test-user-id',
      'other-user'
    );
  });

  it('refuses another user without the reports permission', async () => {
    canAccessUserData.mockResolvedValue(false);
    const res = await request(app).get(
      '/api/reports/fitness-fatigue?userId=other-user'
    );
    expect(res.status).toBe(403);
    expect(getFitnessFatigue).not.toHaveBeenCalled();
  });

  it('passes a service failure to the error handler', async () => {
    getFitnessFatigue.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/reports/fitness-fatigue');
    expect(res.status).toBe(500);
  });
});

describe('fitnessFatigueResponseSchema', () => {
  it('rejects a score outside 0 to 100', () => {
    const bad = {
      ...body,
      readiness: { ...body.readiness, score: 140 },
    };
    expect(fitnessFatigueResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe('GET /api/reports/run-estimates', () => {
  const estimates = {
    vo2Max: { value: 52.4, runs: 3, from: '2026-09-20', to: '2026-10-10' },
    power: {
      averageWatts: 243,
      wattsPerKg: 3.5,
      runs: [{ day: '2026-10-10', watts: 243 }],
    },
  };

  it('returns the estimates in the documented shape', async () => {
    getRunningEstimates.mockResolvedValue(estimates);
    const res = await request(app).get('/api/reports/run-estimates');
    expect(res.status).toBe(200);
    expect(runningEstimatesResponseSchema.safeParse(res.body).success).toBe(
      true
    );
    expect(getRunningEstimates).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('allows both estimates to be null', () => {
    expect(
      runningEstimatesResponseSchema.safeParse({ vo2Max: null, power: null })
        .success
    ).toBe(true);
  });

  it('refuses another user without the reports permission', async () => {
    canAccessUserData.mockResolvedValue(false);
    const res = await request(app).get(
      '/api/reports/run-estimates?userId=other-user'
    );
    expect(res.status).toBe(403);
    expect(getRunningEstimates).not.toHaveBeenCalled();
  });
});
