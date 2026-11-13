import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import heartRateZoneRoutes from '../routes/v2/heartRateZoneRoutes.js';
import heartRateZoneService from '../services/heartRateZoneService.js';
import { ValidationError } from '../utils/errors.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: {
    getHeartRateZones: vi.fn(),
    updateHeartRateZones: vi.fn(),
  },
}));

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/heart-rate-zones', heartRateZoneRoutes);
app.use(errorHandler);

const response = {
  settings: {
    max_heart_rate: null,
    resting_heart_rate: null,
    method: 'percent_max',
    custom_floors: null,
    display_zones: 5,
  },
  resolved: {
    max_hr: 188,
    max_hr_source: 'age',
    resting_hr: null,
    method: 'percent_max',
    effective_method: 'percent_max',
    zones: [
      { zone: 1, lower_bpm: 94, upper_bpm: 112 },
      { zone: 2, lower_bpm: 113, upper_bpm: 131 },
      { zone: 3, lower_bpm: 132, upper_bpm: 149 },
      { zone: 4, lower_bpm: 150, upper_bpm: 168 },
      { zone: 5, lower_bpm: 169, upper_bpm: null },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('heart rate zone routes', () => {
  it('returns the settings and resolved zones', async () => {
    vi.mocked(heartRateZoneService.getHeartRateZones).mockResolvedValue(
      response as never
    );
    const res = await request(app).get('/api/v2/heart-rate-zones');
    expect(res.status).toBe(200);
    expect(res.body.resolved.max_hr_source).toBe('age');
    expect(heartRateZoneService.getHeartRateZones).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('saves a valid update', async () => {
    vi.mocked(heartRateZoneService.updateHeartRateZones).mockResolvedValue(
      response as never
    );
    const res = await request(app)
      .put('/api/v2/heart-rate-zones')
      .send({ max_heart_rate: 185, method: 'percent_max' });
    expect(res.status).toBe(200);
    expect(heartRateZoneService.updateHeartRateZones).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      { max_heart_rate: 185, method: 'percent_max' }
    );
  });

  it.each([
    [{ max_heart_rate: 60 }],
    [{ max_heart_rate: 300 }],
    [{ resting_heart_rate: 10 }],
    [{ method: 'zone2' }],
    [{ method: 'custom', custom_floors: [100, 120, 140] }],
    [{ method: 'custom', custom_floors: [100, 90, 140, 160, 180] }],
    [{ max_heart_rate: 150.5 }],
  ])('rejects an invalid body %j', async (body) => {
    const res = await request(app).put('/api/v2/heart-rate-zones').send(body);
    expect(res.status).toBe(400);
    expect(heartRateZoneService.updateHeartRateZones).not.toHaveBeenCalled();
  });

  it('turns a service validation error into a 400', async () => {
    vi.mocked(heartRateZoneService.updateHeartRateZones).mockRejectedValue(
      new ValidationError('Heart rate reserve zones need a resting heart rate.')
    );
    const res = await request(app)
      .put('/api/v2/heart-rate-zones')
      .send({ method: 'heart_rate_reserve' });
    expect(res.status).toBe(400);
  });

  it('refuses a delegated context for reads and writes', async () => {
    actingAs = 'someone-else';
    const get = await request(app).get('/api/v2/heart-rate-zones');
    const put = await request(app)
      .put('/api/v2/heart-rate-zones')
      .send({ max_heart_rate: 185 });
    expect(get.status).toBe(403);
    expect(put.status).toBe(403);
    expect(heartRateZoneService.getHeartRateZones).not.toHaveBeenCalled();
    expect(heartRateZoneService.updateHeartRateZones).not.toHaveBeenCalled();
  });
});
