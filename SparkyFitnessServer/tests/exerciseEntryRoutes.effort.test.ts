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
  default: { setExerciseEntryEffort: vi.fn() },
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
  vi.mocked(exerciseEntryService.setExerciseEntryEffort).mockResolvedValue(
    undefined
  );
});

describe('POST /exercise-entries/:id/effort', () => {
  it('forwards a valid rating to the service, scoped to the acting user', async () => {
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/effort`)
      .send({ rating: 7 })
      .expect(204);
    expect(exerciseEntryService.setExerciseEntryEffort).toHaveBeenCalledWith(
      'user-123',
      'actor-123',
      ENTRY_ID,
      { rating: 7 }
    );
  });

  it('rejects ratings outside 1-10, fractions, strings and unknown fields', async () => {
    for (const body of [
      { rating: 0 },
      { rating: 11 },
      { rating: 6.5 },
      { rating: '7' },
      { rating: 7, extra: true },
      {},
    ]) {
      await request(app)
        .post(`/exercise-entries/${ENTRY_ID}/effort`)
        .send(body)
        .expect(400);
    }
  });

  it('rejects an id that is not a UUID', async () => {
    await request(app)
      .post('/exercise-entries/not-a-uuid/effort')
      .send({ rating: 5 })
      .expect(400);
  });

  it("returns 404 when the entry is not the caller's", async () => {
    vi.mocked(exerciseEntryService.setExerciseEntryEffort).mockRejectedValue(
      Object.assign(new Error('Exercise entry not found.'), { status: 404 })
    );
    await request(app)
      .post(`/exercise-entries/${ENTRY_ID}/effort`)
      .send({ rating: 5 })
      .expect(404);
  });
});
