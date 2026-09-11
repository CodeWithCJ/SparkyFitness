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
    getWaterIntakeByDateRange: vi.fn(),
    getLatestManualCustomEntriesOnOrBeforeDate: vi.fn(),
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

describe('Measurement Routes - GET /api/measurements/water-intake-range/:startDate/:endDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service rows with 200', async () => {
    const rows = [{ entry_date: '2026-08-30', water_ml: 750 }];
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockResolvedValue(
      rows
    );

    const res = await request(app).get(
      '/api/measurements/water-intake-range/2026-08-01/2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it('forwards the validated window to the service', async () => {
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockResolvedValue(
      []
    );

    await request(app).get(
      '/api/measurements/water-intake-range/2026-08-01/2026-08-30'
    );

    expect(measurementService.getWaterIntakeByDateRange).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      '2026-08-01',
      '2026-08-30'
    );
  });

  it('rejects a malformed date with 400 before reaching the service', async () => {
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockResolvedValue(
      []
    );

    const res = await request(app).get(
      '/api/measurements/water-intake-range/not-a-date/2026-08-30'
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('startDate');
    expect(measurementService.getWaterIntakeByDateRange).not.toHaveBeenCalled();
  });

  it('rejects a well-formed but impossible date with 400', async () => {
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockResolvedValue(
      []
    );

    const res = await request(app).get(
      '/api/measurements/water-intake-range/2026-02-30/2026-08-30'
    );

    expect(res.statusCode).toBe(400);
    expect(measurementService.getWaterIntakeByDateRange).not.toHaveBeenCalled();
  });

  it('maps a Forbidden-prefixed service error to 403', async () => {
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockRejectedValue(
      new Error('Forbidden: You do not have permission to view this data.')
    );

    const res = await request(app).get(
      '/api/measurements/water-intake-range/2026-08-01/2026-08-30'
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: 'Forbidden: You do not have permission to view this data.',
    });
  });

  it('passes any other service error to the error handler', async () => {
    vi.mocked(measurementService.getWaterIntakeByDateRange).mockRejectedValue(
      new Error('boom')
    );

    const res = await request(app).get(
      '/api/measurements/water-intake-range/2026-08-01/2026-08-30'
    );

    expect(res.statusCode).toBe(500);
  });
});

describe('Measurement Routes - GET /custom-entries/latest-manual-on-or-before-date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the per-category latest manual values and passes the day through', async () => {
    vi.mocked(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).mockResolvedValue([
      {
        id: 'entry-1',
        category_id: 'cat-1',
        value: '72.5',
        entry_date: '2026-05-04',
        source: 'manual',
      },
    ]);

    const res = await request(app).get(
      '/api/measurements/custom-entries/latest-manual-on-or-before-date?date=2026-05-10'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'entry-1',
        category_id: 'cat-1',
        value: '72.5',
        entry_date: '2026-05-04',
        source: 'manual',
      },
    ]);
    // Both actor and target resolve to the authenticated user.
    expect(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).toHaveBeenCalledWith('test-user-id', 'test-user-id', '2026-05-10');
  });

  it('is not captured by the /custom-entries/:date route', async () => {
    // The literal segment and the date parameter share a prefix; if the literal
    // route were registered second it would read as date="latest-manual-...".
    vi.mocked(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).mockResolvedValue([]);

    const res = await request(app).get(
      '/api/measurements/custom-entries/latest-manual-on-or-before-date?date=2026-05-10'
    );

    expect(res.statusCode).toBe(200);
    expect(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing date with 400', async () => {
    const res = await request(app).get(
      '/api/measurements/custom-entries/latest-manual-on-or-before-date'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400 instead of letting it reach the database', async () => {
    const res = await request(app).get(
      '/api/measurements/custom-entries/latest-manual-on-or-before-date?date=05-10-2026'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).not.toHaveBeenCalled();
  });

  it('maps a Forbidden-prefixed service error to 403', async () => {
    vi.mocked(
      measurementService.getLatestManualCustomEntriesOnOrBeforeDate
    ).mockRejectedValue(
      new Error('Forbidden: You do not have permission to view this data.')
    );

    const res = await request(app).get(
      '/api/measurements/custom-entries/latest-manual-on-or-before-date?date=2026-05-10'
    );

    expect(res.statusCode).toBe(403);
  });
});
