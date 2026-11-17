import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';
import measurementRoutes from '../routes/measurementRoutes.js';
import { CustomCategoryExistsError } from '../utils/errors.js';

vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn(),
    getWaterIntake: vi.fn(),
    getWaterIntakeByDateRange: vi.fn(),
    getCheckInMeasurements: vi.fn(),
    getLatestCheckInMeasurementsOnOrBeforeDate: vi.fn(),
    getCustomMeasurementEntriesByDate: vi.fn(),
    getCustomMeasurementTimelineEntries: vi.fn(),
    getLatestManualCustomEntriesOnOrBeforeDate: vi.fn(),
    getCheckInMeasurementsByDateRange: vi.fn(),
    getCustomMeasurementsByDateRange: vi.fn(),
    createCustomCategory: vi.fn(),
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

describe('Measurement Routes - GET /api/measurements/water-intake/:date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid date', async () => {
    const waterTotals = {
      water_ml: 750,
      manual_ml: 750,
      ledger_ml: 750,
      food_ml: 0,
    };
    vi.mocked(measurementService.getWaterIntake).mockResolvedValue(waterTotals);

    const res = await request(app).get(
      '/api/measurements/water-intake/2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(waterTotals);
  });

  it('rejects a malformed date with 400 before reaching the service', async () => {
    const res = await request(app).get(
      '/api/measurements/water-intake/not-a-date'
    );

    expect(res.statusCode).toBe(400);
    expect(measurementService.getWaterIntake).not.toHaveBeenCalled();
  });

  it('rejects a well-formed but impossible date with 400', async () => {
    const res = await request(app).get(
      '/api/measurements/water-intake/2026-02-30'
    );

    expect(res.statusCode).toBe(400);
    expect(measurementService.getWaterIntake).not.toHaveBeenCalled();
  });
});

describe('Measurement Routes - GET /api/measurements/check-in/:date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid date', async () => {
    vi.mocked(measurementService.getCheckInMeasurements).mockResolvedValue({
      weight: 72.5,
    });

    const res = await request(app).get('/api/measurements/check-in/2026-08-30');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ weight: 72.5 });
  });

  it('rejects a malformed date with 400 before reaching the service', async () => {
    const res = await request(app).get('/api/measurements/check-in/not-a-date');

    expect(res.statusCode).toBe(400);
    expect(measurementService.getCheckInMeasurements).not.toHaveBeenCalled();
  });

  it('rejects a well-formed but impossible date with 400', async () => {
    const res = await request(app).get('/api/measurements/check-in/2026-02-30');

    expect(res.statusCode).toBe(400);
    expect(measurementService.getCheckInMeasurements).not.toHaveBeenCalled();
  });
});

describe('Measurement Routes - GET /api/measurements/check-in/latest-on-or-before-date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid date', async () => {
    vi.mocked(
      measurementService.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: 72.5 });

    const res = await request(app).get(
      '/api/measurements/check-in/latest-on-or-before-date?date=2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ weight: 72.5 });
  });

  it('rejects a malformed date query param with 400 before reaching the service', async () => {
    const res = await request(app).get(
      '/api/measurements/check-in/latest-on-or-before-date?date=not-a-date'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getLatestCheckInMeasurementsOnOrBeforeDate
    ).not.toHaveBeenCalled();
  });
});

describe('Measurement Routes - GET /api/measurements/custom-entries/:date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid date', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementEntriesByDate
    ).mockResolvedValue([]);

    const res = await request(app).get(
      '/api/measurements/custom-entries/2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('opts into timestamp-day reads without changing the legacy route', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementTimelineEntries
    ).mockResolvedValue([]);
    const res = await request(app).get(
      '/api/measurements/custom-entries/2026-11-03?byTimestamp=true'
    );
    expect(res.statusCode).toBe(200);
    expect(
      measurementService.getCustomMeasurementTimelineEntries
    ).toHaveBeenCalledWith('test-user-id', 'test-user-id', '2026-11-03');
    expect(
      measurementService.getCustomMeasurementEntriesByDate
    ).not.toHaveBeenCalled();
  });

  it('rejects invalid timestamp-day modes before reaching either service', async () => {
    const res = await request(app).get(
      '/api/measurements/custom-entries/2026-11-03?byTimestamp=invalid'
    );
    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getCustomMeasurementTimelineEntries
    ).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400 before reaching the service', async () => {
    const res = await request(app).get(
      '/api/measurements/custom-entries/not-a-date'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getCustomMeasurementEntriesByDate
    ).not.toHaveBeenCalled();
  });
});

describe('Measurement Routes - GET /api/measurements/check-in-measurements-range/:startDate/:endDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid range', async () => {
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-08-30', weight: 72.5 }]);

    const res = await request(app).get(
      '/api/measurements/check-in-measurements-range/2026-08-01/2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ entry_date: '2026-08-30', weight: 72.5 }]);
  });

  it('rejects a malformed startDate with 400 before reaching the service', async () => {
    const res = await request(app).get(
      '/api/measurements/check-in-measurements-range/not-a-date/2026-08-30'
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('startDate');
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).not.toHaveBeenCalled();
  });

  it('rejects a well-formed but impossible date with 400', async () => {
    const res = await request(app).get(
      '/api/measurements/check-in-measurements-range/2026-02-30/2026-08-30'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).not.toHaveBeenCalled();
  });
});

describe('Measurement Routes - GET /api/measurements/custom-measurements-range/:categoryId/:startDate/:endDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the service result with 200 for a valid range', async () => {
    vi.mocked(
      measurementService.getCustomMeasurementsByDateRange
    ).mockResolvedValue([]);

    const res = await request(app).get(
      '/api/measurements/custom-measurements-range/cat-1/2026-08-01/2026-08-30'
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rejects a malformed startDate with 400 before reaching the service', async () => {
    const res = await request(app).get(
      '/api/measurements/custom-measurements-range/cat-1/not-a-date/2026-08-30'
    );

    expect(res.statusCode).toBe(400);
    expect(
      measurementService.getCustomMeasurementsByDateRange
    ).not.toHaveBeenCalled();
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

describe('Measurement Routes - POST /api/measurements/custom-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers 409 when the user already has a category with that name', async () => {
    vi.mocked(measurementService.createCustomCategory).mockRejectedValue(
      new CustomCategoryExistsError('Waist')
    );

    const res = await request(app)
      .post('/api/measurements/custom-categories')
      .send({ name: 'Waist', frequency: 'Daily', measurement_type: 'cm' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'A category named "Waist" already exists.',
    });
  });
});
