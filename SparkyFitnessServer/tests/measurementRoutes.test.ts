import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';
import measurementRoutes from '../routes/measurementRoutes.js';

vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn(),
    updateCustomMeasurementEntry: vi.fn(),
  },
}));

import type { Request, Response, NextFunction } from 'express';

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () => (req: Request, res: Response, next: NextFunction) => next()
  ),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    req.originalUserId = 'test-original-user-id';
    next();
  },
  isAdmin: (req: Request, _res: Response, next: NextFunction) => next(),
}));

const injectUser = (req: Request, res: Response, next: NextFunction) => {
  req.userId = 'test-user-id';
  next();
};

const app = express();
// Simulate the global JSON parser in SparkyFitnessServer.ts
app.use(express.json());
app.use(injectUser);
app.use('/api/measurements', measurementRoutes);
app.use(errorHandler);

describe('Measurement Routes - POST /health-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully parses valid JSON array when Content-Type is application/json', async () => {
    const payload = [
      {
        type: 'weight',
        value: 73.05,
        date: '2026-05-05',
        source: 'home_assistant',
      },
    ];
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      success: true,
      count: 1,
    });

    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, count: 1 });
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      payload,
      'test-user-id',
      'test-user-id',
      { legacyWorkoutSetMinutes: true }
    );
  });

  it('successfully parses single JSON object when Content-Type is application/json', async () => {
    const payload = {
      type: 'weight',
      value: 73.05,
      date: '2026-05-05',
      source: 'home_assistant',
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      success: true,
      count: 1,
    });

    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      [payload],
      'test-user-id',
      'test-user-id',
      { legacyWorkoutSetMinutes: true }
    );
  });

  it('successfully parses raw text JSON array when Content-Type is text/plain', async () => {
    const payload =
      '[{"type":"weight","value":73.05,"date":"2026-05-05","source":"home_assistant"}]';
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      success: true,
      count: 1,
    });

    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'text/plain')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      [
        {
          type: 'weight',
          value: 73.05,
          date: '2026-05-05',
          source: 'home_assistant',
        },
      ],
      'test-user-id',
      'test-user-id',
      { legacyWorkoutSetMinutes: true }
    );
  });

  it('successfully parses concatenated JSON strings when Content-Type is text/plain', async () => {
    const payload =
      '{"type":"weight","value":73.05}{"type":"blood_pressure","value":120}';
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      success: true,
      count: 2,
    });

    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'text/plain')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      [
        { type: 'weight', value: 73.05 },
        { type: 'blood_pressure', value: 120 },
      ],
      'test-user-id',
      'test-user-id',
      { legacyWorkoutSetMinutes: true }
    );
  });

  it('treats X-Workout-Model-Version >= 2 as the seconds-based set model', async () => {
    const payload = [
      {
        type: 'Workout',
        timestamp: '2026-05-05T10:00:00Z',
        activityType: 'Plank',
        sets: [{ set_number: 1, set_type: 'Working Set', duration: 300 }],
      },
    ];
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.processHealthData.mockResolvedValue({
      success: true,
      count: 1,
    });

    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'application/json')
      .set('X-Workout-Model-Version', '2')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      payload,
      'test-user-id',
      'test-user-id',
      { legacyWorkoutSetMinutes: false }
    );
  });

  it('returns 400 when the array contains non-object elements', async () => {
    const res = await request(app)
      .post('/api/measurements/health-data')
      .set('Content-Type', 'application/json')
      .send([null]);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error:
        'Invalid health data format. All entries must be non-null objects.',
    });
  });
});

describe('Measurement Routes - PUT /custom-entries/:id', () => {
  const entryId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an existing custom entry by id', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.updateCustomMeasurementEntry.mockResolvedValue({
      id: entryId,
      value: 125,
      entry_date: '2026-05-05',
    });

    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: 125 });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      id: entryId,
      value: 125,
      entry_date: '2026-05-05',
    });
    expect(measurementService.updateCustomMeasurementEntry).toHaveBeenCalledWith(
      'test-user-id',
      'test-original-user-id',
      entryId,
      { value: 125 }
    );
  });

  it('accepts a boolean value for boolean data_type entries', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.updateCustomMeasurementEntry.mockResolvedValue({
      id: entryId,
      value: 'true',
    });

    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: true });

    expect(res.statusCode).toBe(200);
    expect(measurementService.updateCustomMeasurementEntry).toHaveBeenCalledWith(
      'test-user-id',
      'test-original-user-id',
      entryId,
      { value: true }
    );
  });

  it('passes the acting user id (req.originalUserId) through to the service', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist
    measurementService.updateCustomMeasurementEntry.mockResolvedValue({
      id: entryId,
      value: 125,
    });

    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: 125 });

    expect(res.statusCode).toBe(200);
    // Data owner is req.userId, actor is req.originalUserId.
    expect(measurementService.updateCustomMeasurementEntry).toHaveBeenCalledWith(
      'test-user-id',
      'test-original-user-id',
      entryId,
      { value: 125 }
    );
  });

  it('returns 400 for an empty update body without calling the service', async () => {
    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(measurementService.updateCustomMeasurementEntry).not.toHaveBeenCalled();
  });

  it('returns 404 when the entry does not exist', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist
    measurementService.updateCustomMeasurementEntry.mockRejectedValue(
      new Error('Custom measurement entry not found.')
    );

    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: 125 });

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Custom measurement entry not found.' });
  });

  it('returns 403 when the entry belongs to another user', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist
    measurementService.updateCustomMeasurementEntry.mockRejectedValue(
      new Error(
        'Forbidden: You do not have permission to update this custom measurement entry.'
      )
    );

    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: 125 });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('returns 400 for an invalid value body', async () => {
    const res = await request(app)
      .put(`/api/measurements/custom-entries/${entryId}`)
      .set('Content-Type', 'application/json')
      .send({ value: '' });

    expect(res.statusCode).toBe(400);
  });
});
