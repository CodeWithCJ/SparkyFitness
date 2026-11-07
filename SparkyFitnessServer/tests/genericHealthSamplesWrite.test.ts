import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import errorHandler from '../middleware/errorHandler.js';
import genericHealthRoutes from '../routes/genericHealthRoutes.js';
import { upsertSamplesByDay } from '../services/healthMetricSampleWriter.js';
import { isRequestAllowedForReadOnlyKey } from '../utils/apiKeyScope.js';

// Toggle for the mocked permission middleware so a test can assert the 403 path.
// The real middleware logic is covered by checkPermissionMiddleware.test.ts.
const { permissionState } = vi.hoisted(() => ({
  permissionState: { allow: true },
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () => (_req: Request, res: Response, next: NextFunction) =>
      permissionState.allow
        ? next()
        : res.status(403).json({ error: 'Forbidden' })
  ),
}));

vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn(),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'Europe/Berlin'),
}));

vi.mock('../models/genericHealthRepository.js', () => ({}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({}));

const injectUser = (req: Request, _res: Response, next: NextFunction) => {
  req.userId = 'user-1';
  next();
};

const app = express();
app.use(express.json());
app.use(injectUser);
app.use('/api/generic-health', genericHealthRoutes);
app.use(errorHandler);

const upsertMock = vi.mocked(upsertSamplesByDay);

const heartRateBody = {
  metric: 'heart_rate',
  source: 'xiaomi',
  mode: 'merge',
  window: {
    start: '2026-10-28T00:00:00+01:00',
    end: '2026-10-29T00:00:00+01:00',
  },
  samples: [
    { t: '2026-10-28T06:00:00+01:00', bpm: 58 },
    { t: '2026-10-28T06:01:00+01:00', bpm: 61 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  permissionState.allow = true;
  upsertMock.mockResolvedValue(1);
});

describe('POST /api/generic-health/samples', () => {
  it('stores glucose readings in mmol/L with source attribution and a local calendar day', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        metric: 'blood_glucose',
        samples: [
          {
            t: '2026-10-28T00:30:00+01:00',
            mmol_l: 5.5,
            source_bundle_id: 'com.dexcom.example',
          },
        ],
      });
    expect(res.statusCode).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'blood_glucose',
      'xiaomi',
      [
        expect.objectContaining({
          entry_date: '2026-10-28',
          mmol_l: 5.5,
          source_bundle_id: 'com.dexcom.example',
        }),
      ],
      expect.objectContaining({ mode: 'merge', keepLinked: true })
    );
  });

  it.each([0, -1, 101])('rejects invalid glucose %s', async (mmol_l) => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        metric: 'blood_glucose',
        samples: [{ t: heartRateBody.samples[0]!.t, mmol_l }],
      });
    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('writes the samples through upsertSamplesByDay in merge mode with the window', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send(heartRateBody);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      metric: 'heart_rate',
      source: 'xiaomi',
      mode: 'merge',
      days_written: 1,
      samples_written: 2,
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'heart_rate',
      'xiaomi',
      [
        {
          entry_date: '2026-10-28',
          timestamp: new Date('2026-10-28T05:00:00Z'),
          device_name: null,
          bpm: 58,
        },
        {
          entry_date: '2026-10-28',
          timestamp: new Date('2026-10-28T05:01:00Z'),
          device_name: null,
          bpm: 61,
        },
      ],
      {
        mode: 'merge',
        window: {
          startMs: Date.parse('2026-10-27T23:00:00Z'),
          endMs: Date.parse('2026-10-28T23:00:00Z'),
        },
        days: ['2026-10-28', '2026-10-29'],
        keepLinked: true,
      }
    );
  });

  it('lists every day the window touches, also days without samples', async () => {
    await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        window: {
          start: '2026-10-28T00:00:00+01:00',
          end: '2026-10-30T12:00:00+01:00',
        },
      })
      .expect(200);

    expect(upsertMock.mock.calls[0]?.[5]).toMatchObject({
      mode: 'merge',
      days: ['2026-10-28', '2026-10-29', '2026-10-30'],
    });
  });

  it.each([
    'garmin',
    'Garmin',
    'health-connect',
    'SparkyFitness Watch',
    'manual',
    'Manual',
  ])(
    'rejects the source name %s the server writes samples under',
    async (source) => {
      const res = await request(app)
        .post('/api/generic-health/samples')
        .send({ ...heartRateBody, source });

      expect(res.statusCode).toBe(400);
      expect(upsertMock).not.toHaveBeenCalled();
    }
  );

  it("buckets samples by the user's calendar day, not the UTC day", async () => {
    await request(app)
      .post('/api/generic-health/samples')
      .send({
        metric: 'stress',
        source: 'xiaomi',
        window: {
          start: '2026-10-28T22:00:00Z',
          end: '2026-10-29T00:00:00Z',
        },
        samples: [
          // 22:30 UTC is 23:30 in Berlin, 23:30 UTC is 00:30 the next day.
          { t: '2026-10-28T22:30:00Z', level: 30 },
          { t: '2026-10-28T23:30:00Z', level: 40 },
        ],
      })
      .expect(200);

    const flat = upsertMock.mock.calls[0]?.[4];
    expect(flat?.map((s) => s.entry_date)).toEqual([
      '2026-10-28',
      '2026-10-29',
    ]);
  });

  it('defaults to merge mode', async () => {
    const { mode: _mode, ...body } = heartRateBody;
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send(body);

    expect(res.statusCode).toBe(200);
    expect(upsertMock.mock.calls[0]?.[5]).toMatchObject({ mode: 'merge' });
  });

  it('accepts replace mode without a window', async () => {
    const { window: _window, ...body } = heartRateBody;
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({ ...body, mode: 'replace' });

    expect(res.statusCode).toBe(200);
    expect(upsertMock.mock.calls[0]?.[5]).toEqual({
      mode: 'replace',
      keepLinked: true,
    });
  });

  it('passes the device name with every sample', async () => {
    await request(app)
      .post('/api/generic-health/samples')
      .send({ ...heartRateBody, device_name: 'Xiaomi Watch S4' })
      .expect(200);

    const flat = upsertMock.mock.calls[0]?.[4];
    expect(flat?.every((s) => s.device_name === 'Xiaomi Watch S4')).toBe(true);
  });

  it('rejects merge mode without a window, since a resend would duplicate', async () => {
    const { window: _window, ...body } = heartRateBody;
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send(body);

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a sample outside the window', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        samples: [{ t: '2026-10-29T06:00:00+01:00', bpm: 60 }],
      });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a window that ends before it starts', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        window: {
          start: heartRateBody.window.end,
          end: heartRateBody.window.start,
        },
      });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a window longer than 31 days', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        window: {
          start: '2026-09-01T00:00:00Z',
          end: '2026-10-29T00:00:00Z',
        },
      });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown metric', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({ ...heartRateBody, metric: 'blood_pressure' });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects a sample that does not carry the metric's own field", async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        samples: [{ t: '2026-10-28T06:00:00+01:00', level: 60 }],
      });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects links to workouts or sleep sessions, which passive samples do not have', async () => {
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({
        ...heartRateBody,
        samples: [{ t: '2026-10-28T06:00:00+01:00', bpm: 60, ex: 'entry-1' }],
      });

    expect(res.statusCode).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects an empty source, and an empty sample list outside merge mode', async () => {
    await request(app)
      .post('/api/generic-health/samples')
      .send({ ...heartRateBody, source: ' ' })
      .expect(400);
    const { window: _window, ...noWindow } = heartRateBody;
    await request(app)
      .post('/api/generic-health/samples')
      .send({ ...noWindow, mode: 'replace', samples: [] })
      .expect(400);
    // Merge still needs its window, empty or not.
    await request(app)
      .post('/api/generic-health/samples')
      .send({ ...noWindow, samples: [] })
      .expect(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('accepts an empty merge, which clears the window on every day it touches', async () => {
    upsertMock.mockResolvedValue(2);
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send({ ...heartRateBody, samples: [] })
      .expect(200);

    expect(res.body).toMatchObject({ days_written: 2, samples_written: 0 });
    expect(upsertMock.mock.calls[0]?.[4]).toEqual([]);
    expect(upsertMock.mock.calls[0]?.[5]).toMatchObject({
      mode: 'merge',
      days: ['2026-10-28', '2026-10-29'],
    });
  });

  it('returns 403 and writes nothing when the permission check fails', async () => {
    permissionState.allow = false;
    const res = await request(app)
      .post('/api/generic-health/samples')
      .send(heartRateBody);

    expect(res.statusCode).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('is not open to read-only API keys', () => {
    expect(
      isRequestAllowedForReadOnlyKey('POST', '/api/generic-health/samples')
    ).toBe(false);
  });
});
