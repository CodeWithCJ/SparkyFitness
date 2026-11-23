import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { BloodAlcoholResponse } from '@workspace/shared';
import { getBloodAlcoholEstimate } from '../services/bloodAlcoholService.js';
import nutritionKineticsRoutes from '../routes/v2/nutritionKineticsRoutes.js';

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'user-1';
    // A delegated request: the signed-in actor differs from the viewed user.
    if (req.headers['x-test-delegated']) {
      req.originalUserId = 'actor-2';
    }
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../services/bloodAlcoholService.js', () => ({
  getBloodAlcoholEstimate: vi.fn(),
}));
vi.mock('../services/caffeineKineticsService.js', () => ({
  getActiveCaffeineKinetics: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use('/api/v2/nutrition', nutritionKineticsRoutes);

const getEstimate = vi.mocked(getBloodAlcoholEstimate);

const answer: BloodAlcoholResponse = {
  status: 'missing_inputs',
  missing_inputs: ['weight'],
  formula: 'watson',
  fell_back_from: null,
  display_unit: 'permille',
  elimination_rate: 0.15,
  distribution_factor: null,
  weight_kg: null,
  doses: [],
  estimated_now_permille: null,
  peak: null,
  has_estimated_times: false,
};

describe('GET /api/v2/nutrition/blood-alcohol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the estimate for the signed-in user', async () => {
    getEstimate.mockResolvedValue(answer);

    const res = await request(app).get(
      '/api/v2/nutrition/blood-alcohol?date=2026-11-07'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(answer);
    expect(getEstimate).toHaveBeenCalledWith('user-1', {
      date: '2026-11-07',
    });
  });

  it.each(['', '?date=yesterday', '?date=2026-13-40'])(
    'rejects a missing or malformed date (%s)',
    async (query) => {
      const res = await request(app).get(
        `/api/v2/nutrition/blood-alcohol${query}`
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(getEstimate).not.toHaveBeenCalled();
    }
  );

  it('refuses a delegated (on-behalf-of) request', async () => {
    const res = await request(app)
      .get('/api/v2/nutrition/blood-alcohol?date=2026-11-07')
      .set('x-test-delegated', '1');

    expect(res.statusCode).toBe(403);
    expect(getEstimate).not.toHaveBeenCalled();
  });

  it('passes service errors to the error handler', async () => {
    getEstimate.mockRejectedValue(new Error('boom'));

    const res = await request(app).get(
      '/api/v2/nutrition/blood-alcohol?date=2026-11-07'
    );

    expect(res.statusCode).toBe(500);
  });
});
