import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
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
  default: { attachGpsTrackToExerciseEntry: vi.fn() },
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
const points = [
  { t: '2026-10-06T10:00:00.000Z', lat: 51.5, lon: -0.12, alt: 12 },
  { t: '2026-10-06T10:00:05.000Z', lat: 51.5001, lon: -0.12, alt: 12.4 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    exerciseEntryService.attachGpsTrackToExerciseEntry
  ).mockResolvedValue(undefined);
});

describe('POST /exercise-entries/:id/gps-track', () => {
  it('forwards a valid track to the service, scoped to the acting user', async () => {
    const laps = [
      {
        lap_index: 1,
        start_time: points[0].t,
        end_time: points[1].t,
      },
    ];

    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/gps-track`)
      .send({ points, laps })
      .expect(204);

    expect(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).toHaveBeenCalledWith('user-123', 'actor-123', ENTRY_ID, {
      points,
      laps,
    });
  });

  it('rejects a track with fewer than two points', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/gps-track`)
      .send({ points: [points[0]] })
      .expect(400);

    expect(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('rejects a point or lap with an invalid timestamp', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/gps-track`)
      .send({
        points: [{ ...points[0], t: 'not-a-time' }, points[1]],
        laps: [
          {
            lap_index: 1,
            start_time: 'yesterday',
            end_time: points[1].t,
          },
        ],
      })
      .expect(400);

    expect(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID entry id', async () => {
    await request(app)
      .post('/exercise-entries/not-a-uuid/gps-track')
      .send({ points })
      .expect(400);
  });

  it('returns 404 when the entry does not belong to the caller', async () => {
    const error = Object.assign(new Error('Exercise entry not found.'), {
      status: 404,
    });
    vi.mocked(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).mockRejectedValue(error);

    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/gps-track`)
      .send({ points })
      .expect(404);
  });
});
