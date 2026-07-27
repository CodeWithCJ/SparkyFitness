import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import exerciseService from '../services/exerciseService.js';

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
// Real multer (memory storage) so multipart fields land in req.body the way
// the production upload middleware delivers them.
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() =>
    multer({ storage: multer.memoryStorage() })
  ),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: { updateExerciseEntry: vi.fn() },
}));
vi.mock('../services/exerciseEntryService.js', () => ({ default: {} }));
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
  res.status(500).json({ error: err.message });
});

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';

const updateData = () =>
  vi.mocked(exerciseService.updateExerciseEntry).mock.calls[0][3];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exerciseService.updateExerciseEntry).mockResolvedValue({
    id: ENTRY_ID,
  });
});

describe('PUT /exercise-entries/:id distance clear contract', () => {
  it('normalizes an empty multipart distance (clear while uploading an image) to null', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .field('duration_minutes', '30')
      .field('distance', '')
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(200);

    expect(exerciseService.updateExerciseEntry).toHaveBeenCalledTimes(1);
    expect(updateData().distance).toBeNull();
  });

  it('passes a real multipart distance value through', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .field('distance', '5.2')
      .attach('image', Buffer.from('fake-image'), 'photo.jpg')
      .expect(200);

    expect(updateData().distance).toBe('5.2');
  });

  it('keeps JSON null (clear) and omitted (derive/preserve) distinct', async () => {
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .send({ distance: null })
      .expect(200);
    expect(updateData().distance).toBeNull();

    vi.mocked(exerciseService.updateExerciseEntry).mockClear();
    await request(app)
      .put(`/exercise-entries/${ENTRY_ID}`)
      .send({ notes: 'still a run' })
      .expect(200);
    expect(updateData().distance).toBeUndefined();
  });
});
