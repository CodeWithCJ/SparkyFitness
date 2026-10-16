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
  default: { attachLapsToExerciseEntry: vi.fn() },
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
const laps = [
  {
    lap_index: 1,
    start_time: '2026-10-06T10:00:00.000Z',
    end_time: '2026-10-06T10:05:00.000Z',
    distance_meters: 820,
    avg_heart_rate: 150,
  },
  {
    lap_index: 2,
    start_time: '2026-10-06T10:05:00.000Z',
    end_time: '2026-10-06T10:09:30.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exerciseEntryService.attachLapsToExerciseEntry).mockResolvedValue(
    undefined
  );
});

describe('POST /exercise-entries/:id/laps', () => {
  it('forwards valid laps to the service, scoped to the acting user', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/laps`)
      .send({ laps })
      .expect(204);
    expect(exerciseEntryService.attachLapsToExerciseEntry).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      { laps }
    );
  });

  it('rejects an empty list, a bad lap and unknown fields', async () => {
    for (const body of [
      { laps: [] },
      { laps: [{ lap_index: 0, start_time: 'a', end_time: 'b' }] },
      { laps, extra: true },
      // The same lap twice would make the insert fail.
      { laps: [laps[0], { ...laps[0] }] },
      // Ends before it starts, or an absurd number.
      { laps: [{ ...laps[0], end_time: laps[0].start_time }] },
      { laps: [{ ...laps[0], lap_index: 1e12 }] },
      // No offset: it would be read in the server's own timezone.
      { laps: [{ ...laps[0], start_time: '2026-10-06T10:00:00' }] },
    ]) {
      await request(app)
        .post(`/exercise-entries/${ENTRY_ID}/laps`)
        .send(body)
        .expect(400);
    }
    expect(
      exerciseEntryService.attachLapsToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('answers 409 for an entry that has a GPS track', async () => {
    vi.mocked(exerciseEntryService.attachLapsToExerciseEntry).mockRejectedValue(
      Object.assign(new Error('This entry has a GPS track'), { status: 409 })
    );
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/laps`)
      .send({ laps })
      .expect(409);
  });

  it('rejects a non-UUID entry id', async () => {
    await request(app)
      .post('/exercise-entries/not-a-uuid/laps')
      .send({ laps })
      .expect(400);
  });

  it("returns 404 when the entry is not the caller's", async () => {
    vi.mocked(exerciseEntryService.attachLapsToExerciseEntry).mockRejectedValue(
      Object.assign(new Error('Exercise entry not found.'), { status: 404 })
    );
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/laps`)
      .send({ laps })
      .expect(404);
  });
});
