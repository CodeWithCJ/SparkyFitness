import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import { attachExerciseEntryWatchTelemetryRequestSchema } from '@workspace/shared';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import exerciseEntryService from '../services/exerciseEntryService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-123';
    req.originalUserId = 'actor-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (_req: any, _res: any, next: any) => next()
  ),
}));
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() =>
    multer({ storage: multer.memoryStorage() })
  ),
}));
vi.mock('../services/exerciseService.js', () => ({ default: {} }));
vi.mock('../services/exerciseEntryService.js', () => ({
  default: { attachWatchTelemetryToExerciseEntry: vi.fn() },
}));
vi.mock('../services/fitImportService.js', () => ({ default: {} }));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/exercise-entries', exerciseEntryRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status ?? 500).json({ error: err.message });
});

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    exerciseEntryService.attachWatchTelemetryToExerciseEntry
  ).mockResolvedValue(undefined);
});

describe('POST /exercise-entries/:id/watch-telemetry', () => {
  it('forwards a valid heart-rate series to the service, scoped to the acting user', async () => {
    const hrSamples = [
      { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
      { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
    ];

    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ hrSamples })
      .expect(204);

    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      hrSamples,
      undefined,
      undefined,
      undefined,
      undefined
    );
  });

  it('rejects an invalid entry id', async () => {
    await request(app)
      .post('/exercise-entries/not-a-uuid/watch-telemetry')
      .send({ hrSamples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }] })
      .expect(400);
    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('rejects a series with fewer than two samples', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ hrSamples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }] })
      .expect(400);
    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('rejects a heart-rate series above the sample cap', () => {
    const hrSamples = Array.from({ length: 10001 }, (_, i) => ({
      t: new Date(Date.UTC(2026, 8, 17, 10, 0, i)).toISOString(),
      bpm: 120,
    }));

    const parsed = attachExerciseEntryWatchTelemetryRequestSchema.safeParse({
      hrSamples,
    });

    expect(parsed.success).toBe(false);
  });

  it('forwards measured active energy alongside the series', async () => {
    const hrSamples = [
      { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
      { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
    ];

    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ hrSamples, activeEnergyKcal: 87.4 })
      .expect(204);

    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      hrSamples,
      87.4,
      undefined,
      undefined,
      undefined
    );
  });

  it('accepts active energy on its own, with no heart-rate series', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ activeEnergyKcal: 42 })
      .expect(204);

    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      undefined,
      42,
      undefined,
      undefined,
      undefined
    );
  });

  it('forwards the watch exercise duration', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ durationMinutes: 12.5 })
      .expect(204);

    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      undefined,
      undefined,
      12.5,
      undefined,
      undefined
    );
  });

  it('forwards a stride length on its own, and null to clear it', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ strideLengthCm: 101.5 })
      .expect(204);
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({ strideLengthCm: null })
      .expect(204);

    const calls = vi.mocked(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).mock.calls;
    expect(calls[0]).toEqual([
      'user-123',
      'actor-123',
      ENTRY_ID,
      undefined,
      undefined,
      undefined,
      undefined,
      101.5,
    ]);
    expect(calls[1][7]).toBeNull();
  });

  it('rejects a body carrying neither heart rate nor active energy', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({})
      .expect(400);
    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('maps a not-found service error to 404', async () => {
    const notFound = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    notFound.status = 404;
    vi.mocked(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).mockRejectedValue(notFound);

    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/watch-telemetry`)
      .send({
        hrSamples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      })
      .expect(404);
  });
});
