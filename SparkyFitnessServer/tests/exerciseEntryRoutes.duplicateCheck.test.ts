import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
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
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    single: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  })),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: { createExerciseEntry: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exerciseService.createExerciseEntry).mockResolvedValue({
    id: 'entry-1',
  });
});

describe('POST /exercise-entries duplicate-check wiring', () => {
  it('skips the manual same-exercise/same-date dedup for a plain diary add', async () => {
    await request(app)
      .post('/exercise-entries')
      .send({
        exercise_id: '11111111-1111-1111-1111-111111111111',
        duration_minutes: 30,
        calories_burned: 200,
        entry_date: '2026-07-18',
      })
      .expect(201);

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledTimes(1);
    const [, , , options] = vi.mocked(exerciseService.createExerciseEntry).mock
      .calls[0];
    expect(options).toEqual({ skipDuplicateCheck: true });
  });

  it('keeps the assignment+date dedup when the entry is tied to a workout plan assignment', async () => {
    await request(app)
      .post('/exercise-entries')
      .send({
        exercise_id: '11111111-1111-1111-1111-111111111111',
        duration_minutes: 30,
        calories_burned: 200,
        entry_date: '2026-07-18',
        workout_plan_assignment_id: 'assignment-1',
      })
      .expect(201);

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledTimes(1);
    const [, , , options] = vi.mocked(exerciseService.createExerciseEntry).mock
      .calls[0];
    expect(options).toEqual({ skipDuplicateCheck: false });
  });
});
