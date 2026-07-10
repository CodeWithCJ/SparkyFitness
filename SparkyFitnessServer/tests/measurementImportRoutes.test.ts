import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import measurementService from '../services/measurementService.js';
import errorHandler from '../middleware/errorHandler.js';

// Toggle used by the mocked permission middleware so a single test can assert
// the 403 path without re-registering the route.
const { permissionState } = vi.hoisted(() => ({
  permissionState: { allow: true },
}));

vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn(),
  },
}));
vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'acting-user-id';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware', () => ({
  default: vi.fn(
    () => (_req: Request, res: Response, next: NextFunction) =>
      permissionState.allow
        ? next()
        : res.status(403).json({ error: 'Forbidden' })
  ),
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));

import measurementRoutes from '../routes/measurementRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/measurements', measurementRoutes);
app.use(errorHandler);

const post = (body: unknown) =>
  request(app)
    .post('/api/measurements/import-health-data')
    .set('Content-Type', 'application/json')
    .send(body);

describe('POST /api/measurements/import-health-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionState.allow = true;
  });

  it('imports a mixed-category payload and returns per-record outcomes', async () => {
    const items = [
      { type: 'weight', value: 73.1, date: '2026-05-05' },
      { type: 'heart_rate', value: 61, unit: 'bpm', date: '2026-05-05' },
      { type: 'water', value: 500, unit: 'ml', date: '2026-05-05' },
    ];
    const serviceResult = {
      message: 'All health data successfully processed.',
      processed: [
        { type: 'weight', status: 'success', data: { id: 'r1' } },
        { type: 'heart_rate', status: 'success', data: { id: 'r2' } },
        { type: 'water', status: 'success', data: { id: 'r3' } },
      ],
      errors: [],
      skipped: [],
    };
    // @ts-expect-error mock
    measurementService.processHealthData.mockResolvedValue(serviceResult);

    const res = await post({ items });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(serviceResult);
    expect(measurementService.processHealthData).toHaveBeenCalledTimes(1);
  });

  it('defaults a blank source to CSV_Import and preserves an explicit source, passing actingUserId', async () => {
    // @ts-expect-error mock
    measurementService.processHealthData.mockResolvedValue({
      message: 'ok',
      processed: [],
      errors: [],
      skipped: [],
    });

    await post({
      items: [
        { type: 'weight', value: 73.1, date: '2026-05-05' },
        {
          type: 'weight',
          value: 74.0,
          date: '2026-05-06',
          source: 'Garmin',
        },
      ],
    });

    const [forwardedItems, userId, actingUserId] = vi.mocked(
      measurementService.processHealthData
    ).mock.calls[0];
    expect(forwardedItems[0].source).toBe('CSV_Import');
    expect(forwardedItems[1].source).toBe('Garmin');
    expect(userId).toBe('test-user-id');
    expect(actingUserId).toBe('acting-user-id');
  });

  it('surfaces service-reported partial failures as a 200 with populated errors', async () => {
    // Both rows are structurally valid; the service rejects the second one
    // semantically (e.g. an out-of-range date), which must not fail the request.
    const items = [
      { type: 'weight', value: 73.1, date: '2026-05-05' },
      { type: 'steps', value: 1050.5, date: '2026-05-06' },
    ];
    const serviceResult = {
      message: 'Some health data entries could not be processed.',
      processed: [{ type: 'weight', status: 'success', data: { id: 'r1' } }],
      errors: [
        {
          error: 'Invalid value for steps. Must be an integer.',
          entry: items[1],
        },
      ],
      skipped: [],
    };
    // @ts-expect-error mock
    measurementService.processHealthData.mockResolvedValue(serviceResult);

    const res = await post({ items });

    expect(res.statusCode).toBe(200);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.processed).toHaveLength(1);
  });

  it('returns 403 when the caller lacks checkin permission', async () => {
    permissionState.allow = false;

    const res = await post({
      items: [{ type: 'weight', value: 73.1, date: '2026-05-05' }],
    });

    expect(res.statusCode).toBe(403);
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 400 when items is empty', async () => {
    const res = await post({ items: [] });

    expect(res.statusCode).toBe(400);
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 400 when items is missing', async () => {
    const res = await post({});

    expect(res.statusCode).toBe(400);
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });

  it('returns 400 when a row has no date, entry_date, or timestamp', async () => {
    const res = await post({ items: [{ type: 'weight', value: 73.1 }] });

    expect(res.statusCode).toBe(400);
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
  });
});
