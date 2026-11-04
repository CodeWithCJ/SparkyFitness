import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';
import errorHandler from '../middleware/errorHandler.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'user-123';
    req.originalUserId = 'user-123';
    next();
  }),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () => (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: vi.fn(() => ({
    single: vi.fn(
      () => (_req: Request, _res: Response, next: NextFunction) => next()
    ),
  })),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: { createExerciseEntry: vi.fn(), updateExerciseEntry: vi.fn() },
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
app.use(errorHandler);

const unknownExercise = (message: string) =>
  Object.assign(new Error(message), { status: 404 });

const unknownExerciseId = '22222222-2222-2222-2222-222222222222';
const entryId = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('exercise entry routes with an unknown exercise_id', () => {
  // The error thrown by exerciseService.prepareExerciseEntryForCreate and by
  // the entry model's create and update snapshot lookups, answered by the
  // shared error handler.
  it('POST returns 404 for an unknown exercise', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockRejectedValue(
      unknownExercise('Exercise not found.')
    );

    const res = await request(app).post('/exercise-entries').send({
      exercise_id: unknownExerciseId,
      duration_minutes: 30,
      calories_burned: 200,
      entry_date: '2026-10-15',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Exercise not found.');
  });

  it('POST /from-plan returns 404 for an unknown exercise', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockRejectedValue(
      unknownExercise('Exercise not found.')
    );

    const res = await request(app)
      .post('/exercise-entries/from-plan')
      .send({
        entry_date: '2026-10-15',
        exercises: [
          {
            exercise_id: unknownExerciseId,
            duration_minutes: 30,
            calories_burned: 200,
          },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Exercise not found.');
  });

  it('PUT returns 404 when the new exercise_id has no exercise', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockRejectedValue(
      unknownExercise('Exercise not found.')
    );

    const res = await request(app)
      .put(`/exercise-entries/${entryId}`)
      .send({ exercise_id: unknownExerciseId });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Exercise not found.');
  });

  it.each(['not-a-uuid', '', 0, false])(
    'PUT rejects exercise_id %j before reaching the database',
    async (exerciseId) => {
      const res = await request(app)
        .put(`/exercise-entries/${entryId}`)
        .send({ exercise_id: exerciseId });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Exercise ID must be a valid UUID.' });
      expect(exerciseService.updateExerciseEntry).not.toHaveBeenCalled();
    }
  );

  it('PUT still accepts a null exercise_id', async () => {
    vi.mocked(exerciseService.updateExerciseEntry).mockResolvedValue({
      id: entryId,
    });

    await request(app)
      .put(`/exercise-entries/${entryId}`)
      .send({ exercise_id: null, notes: 'kept' })
      .expect(200);
  });

  it('leaves other failures to the error handler', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockRejectedValue(
      new Error('Unexpected failure')
    );

    const res = await request(app).post('/exercise-entries').send({
      exercise_id: unknownExerciseId,
      duration_minutes: 30,
      calories_burned: 200,
      entry_date: '2026-10-15',
    });

    expect(res.status).toBe(500);
  });

  it('does not match on the message alone', async () => {
    vi.mocked(exerciseService.createExerciseEntry).mockRejectedValue(
      new Error('Exercise not found.')
    );

    const res = await request(app).post('/exercise-entries').send({
      exercise_id: unknownExerciseId,
      duration_minutes: 30,
      calories_burned: 200,
      entry_date: '2026-10-15',
    });

    expect(res.status).toBe(500);
  });
});
