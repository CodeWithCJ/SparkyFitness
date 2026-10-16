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
  default: { setExerciseEntryDistance: vi.fn() },
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
  vi.mocked(exerciseEntryService.setExerciseEntryDistance).mockResolvedValue(
    undefined
  );
});

describe('POST /exercise-entries/:id/distance', () => {
  it('forwards a valid distance to the service, scoped to the acting user', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance`)
      .send({ distance_km: 5.2 })
      .expect(204);
    expect(exerciseEntryService.setExerciseEntryDistance).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      { distance_km: 5.2 }
    );
  });

  it('rejects zero, negative, absurd and unknown fields', async () => {
    for (const body of [
      { distance_km: 0 },
      { distance_km: -1 },
      { distance_km: 5000 },
      { distance_km: '5' },
      { distance_km: 5, extra: true },
      {},
    ]) {
      await request(app)
        .post(`/exercise-entries/${ENTRY_ID}/distance`)
        .send(body)
        .expect(400);
    }
  });

  it('answers 409 for an entry that has a GPS track', async () => {
    vi.mocked(exerciseEntryService.setExerciseEntryDistance).mockRejectedValue(
      Object.assign(new Error('This entry has a GPS track'), { status: 409 })
    );
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance`)
      .send({ distance_km: 5 })
      .expect(409);
  });

  it("returns 404 when the entry is not the caller's", async () => {
    vi.mocked(exerciseEntryService.setExerciseEntryDistance).mockRejectedValue(
      Object.assign(new Error('Exercise entry not found.'), { status: 404 })
    );
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/distance`)
      .send({ distance_km: 5 })
      .expect(404);
  });

  it('rejects a non-UUID entry id', async () => {
    await request(app)
      .post('/exercise-entries/not-a-uuid/distance')
      .send({ distance_km: 5 })
      .expect(400);
  });
});
