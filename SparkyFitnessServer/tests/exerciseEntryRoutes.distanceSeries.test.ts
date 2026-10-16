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
  default: {
    attachDistanceSeriesToExerciseEntry: vi.fn(),
    getExerciseEntryDistanceSeries: vi.fn(),
  },
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
  [0, 0],
  [10, 28],
  [20, 57],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    exerciseEntryService.attachDistanceSeriesToExerciseEntry
  ).mockResolvedValue(undefined);
});

describe('POST /exercise-entries/:id/distance-series', () => {
  it('stores the series for the signed-in user', async () => {
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance-series`)
      .send({ points });
    expect(res.status).toBe(204);
    expect(
      exerciseEntryService.attachDistanceSeriesToExerciseEntry
    ).toHaveBeenCalledWith('user-123', 'actor-123', ENTRY_ID, { points });
  });

  it('rejects a series with fewer than two rows', async () => {
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance-series`)
      .send({ points: [[0, 0]] });
    expect(res.status).toBe(400);
  });

  it.each([
    [
      'active seconds',
      [
        [0, 0],
        [60, 100],
        [30, 150],
      ],
    ],
    [
      'cumulative metres',
      [
        [0, 0],
        [30, 100],
        [60, 50],
        [90, 75],
      ],
    ],
  ])('rejects a series where %s decrease', async (_name, rows) => {
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance-series`)
      .send({ points: rows });
    expect(res.status).toBe(400);
    expect(
      exerciseEntryService.attachDistanceSeriesToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('accepts a series that stands still between rows', async () => {
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance-series`)
      .send({
        points: [
          [0, 0],
          [30, 100],
          [60, 100],
        ],
      });
    expect(res.status).toBe(204);
  });

  it('rejects an id that is not a uuid', async () => {
    const res = await request(app)
      .post('/exercise-entries/not-a-uuid/distance-series')
      .send({ points });
    expect(res.status).toBe(400);
  });

  it("answers 404 for an entry that is not the user's", async () => {
    vi.mocked(
      exerciseEntryService.attachDistanceSeriesToExerciseEntry
    ).mockRejectedValue(
      Object.assign(new Error('Exercise entry not found.'), { status: 404 })
    );
    const res = await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance-series`)
      .send({ points });
    expect(res.status).toBe(404);
  });
});

describe('GET /exercise-entries/:id/distance-series', () => {
  it('returns the stored points, or null', async () => {
    vi.mocked(
      exerciseEntryService.getExerciseEntryDistanceSeries
    ).mockResolvedValue(points as [number, number][]);
    const res = await request(app).get(
      `/exercise-entries/${ENTRY_ID}/distance-series`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ points });
    expect(
      exerciseEntryService.getExerciseEntryDistanceSeries
    ).toHaveBeenCalledWith('actor-123', ENTRY_ID);
  });
});
