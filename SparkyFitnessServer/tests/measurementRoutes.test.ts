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
  },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const injectUser = (req: any, res: any, next: any) => {
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
      'test-user-id'
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
      'test-user-id'
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
      'test-user-id'
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
      'test-user-id'
    );
  });
});
