import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';
import healthDataRoutes from '../integrations/healthData/healthDataRoutes.js';

vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn(),
    processSleepEntry: vi.fn(),
  },
}));

vi.mock('../models/sleepRepository.js', () => ({
  default: {
    getSleepEntriesByUserIdAndDateRange: vi.fn(),
  },
}));

import type { Request, Response, NextFunction } from 'express';

const injectUser = (req: Request, res: Response, next: NextFunction) => {
  req.userId = 'test-user-id';
  next();
};

const app = express();
// Simulate the global JSON parser in SparkyFitnessServer.ts
app.use(express.json());
app.use(injectUser);
app.use('/api/health-data', healthDataRoutes);
app.use(errorHandler);

describe('Health Data Routes - POST /api/health-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with per-record outcomes when the service reports mixed results', async () => {
    const payload = [
      { type: 'step', value: 1000, date: '2026-05-05', source: 'HealthKit' },
      { type: 'step', value: 'bad', date: '2026-05-05', source: 'HealthKit' },
    ];
    const serviceResult = {
      message: 'Some health data entries could not be processed.',
      processed: [{ type: 'step', status: 'success', data: { id: 'row-1' } }],
      errors: [
        {
          error: 'Invalid value for step. Must be an integer.',
          entry: payload[1],
        },
      ],
      skipped: [],
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue(serviceResult);

    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(serviceResult);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      payload,
      'test-user-id',
      'test-user-id'
    );
  });

  it('wraps a single JSON object body into an array', async () => {
    const payload = {
      type: 'weight',
      value: 73.05,
      date: '2026-05-05',
      source: 'HealthKit',
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      message: 'All health data successfully processed.',
      processed: [],
      errors: [],
      skipped: [],
    });

    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      [payload],
      'test-user-id',
      'test-user-id'
    );
  });

  it('returns 400 for a non-object body', async () => {
    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'text/plain')
      .send('not json');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Invalid request body format. Expected JSON object or array.',
    });
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 400 when the array contains null entries', async () => {
    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'application/json')
      .send([null]);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error:
        'Invalid health data format. All entries must be non-null objects.',
    });
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 400 when the array contains primitive entries', async () => {
    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'application/json')
      .send([{ type: 'step', value: 1, date: '2026-05-05' }, 42]);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error:
        'Invalid health data format. All entries must be non-null objects.',
    });
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 500 via the error handler when the service throws unexpectedly', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist
    measurementService.processHealthData.mockRejectedValue(
      new Error('database unavailable')
    );

    const res = await request(app)
      .post('/api/health-data')
      .set('Content-Type', 'application/json')
      .send([{ type: 'step', value: 1000, date: '2026-05-05' }]);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('database unavailable');
  });
});
