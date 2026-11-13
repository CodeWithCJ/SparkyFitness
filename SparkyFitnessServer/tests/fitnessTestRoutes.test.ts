import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import fitnessTestRoutes from '../routes/v2/fitnessTestRoutes.js';
import {
  createFitnessTest,
  deleteFitnessTest,
  getLatestFitnessTest,
  InvalidFitnessTestError,
  listFitnessTests,
  UnknownExerciseEntryError,
} from '../models/fitnessTestRepository.js';

vi.mock('../models/fitnessTestRepository.js', () => {
  class InvalidFitnessTestError extends Error {}
  class UnknownExerciseEntryError extends Error {}
  return {
    createFitnessTest: vi.fn(),
    deleteFitnessTest: vi.fn(),
    getLatestFitnessTest: vi.fn(),
    listFitnessTests: vi.fn(),
    InvalidFitnessTestError,
    UnknownExerciseEntryError,
  };
});

let actingAs = 'test-user-id';
const app = express();
app.use(express.json());
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/fitness-tests', fitnessTestRoutes);
app.use(errorHandler);

const test = {
  id: '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10',
  test_type: '5k',
  test_date: '2026-10-18',
  distance_meters: 5000,
  duration_seconds: 1500,
  split_distance_meters: null,
  result_value: 1500,
  exercise_entry_id: null,
  surface: 'outdoor',
  incline_percent: null,
  incline_adjusted: false,
  paces: {
    thresholdSecondsPerKm: 290,
    equivalent5kSeconds: 1500,
    zones: [],
    raceZones: {},
  },
  created_at: '2026-10-18T10:00:00.000Z',
};

const body = {
  test_type: '5k',
  test_date: '2026-10-18',
  distance_meters: 5000,
  duration_seconds: 1500,
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('fitness test routes', () => {
  it('lists the tests', async () => {
    vi.mocked(listFitnessTests).mockResolvedValue([test] as never);
    const res = await request(app).get('/api/v2/fitness-tests');
    expect(res.status).toBe(200);
    expect(res.body.tests).toHaveLength(1);
    expect(listFitnessTests).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('reads the latest test, or null before the first', async () => {
    vi.mocked(getLatestFitnessTest).mockResolvedValueOnce(test as never);
    const first = await request(app).get('/api/v2/fitness-tests/latest');
    expect(first.body.test.id).toBe(test.id);
    vi.mocked(getLatestFitnessTest).mockResolvedValueOnce(null);
    const none = await request(app).get('/api/v2/fitness-tests/latest');
    expect(none.body).toEqual({ test: null });
  });

  it('saves a test from its measurements', async () => {
    vi.mocked(createFitnessTest).mockResolvedValue(test as never);
    const res = await request(app).post('/api/v2/fitness-tests').send(body);
    expect(res.status).toBe(200);
    expect(createFitnessTest).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining(body),
      'test-user-id'
    );
  });

  it('saves a treadmill test with its incline, adjusted unless turned off', async () => {
    vi.mocked(createFitnessTest).mockResolvedValue(test as never);
    const treadmill = {
      ...body,
      test_type: 'cooper',
      distance_meters: 3000,
      duration_seconds: 720,
      surface: 'indoor',
      incline_percent: 3,
    };
    const res = await request(app)
      .post('/api/v2/fitness-tests')
      .send(treadmill);
    expect(res.status).toBe(200);
    expect(createFitnessTest).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({
        surface: 'indoor',
        incline_percent: 3,
        incline_adjusted: true,
      }),
      'test-user-id'
    );
    await request(app)
      .post('/api/v2/fitness-tests')
      .send({ ...treadmill, incline_adjusted: false });
    expect(createFitnessTest).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({ incline_adjusted: false }),
      'test-user-id'
    );
  });

  it('treats a test with no surface as outdoor', async () => {
    vi.mocked(createFitnessTest).mockResolvedValue(test as never);
    await request(app).post('/api/v2/fitness-tests').send(body);
    expect(createFitnessTest).toHaveBeenLastCalledWith(
      'test-user-id',
      expect.objectContaining({ surface: 'outdoor' }),
      'test-user-id'
    );
  });

  it('rejects a body that is not a test', async () => {
    for (const bad of [
      {},
      { ...body, test_type: 'mile' },
      { ...body, test_date: '2026-02-31' },
      { ...body, distance_meters: -5 },
      { ...body, exercise_entry_id: 'not-a-uuid' },
      { ...body, surface: 'track' },
      { ...body, surface: 'indoor', incline_percent: 20 },
      { ...body, surface: 'indoor', incline_percent: -1 },
      // An incline only applies to a treadmill.
      { ...body, incline_percent: 2 },
    ]) {
      const res = await request(app).post('/api/v2/fitness-tests').send(bad);
      expect(res.status).toBe(400);
    }
    expect(createFitnessTest).not.toHaveBeenCalled();
  });

  it('answers 400 for measurements that make no believable test', async () => {
    vi.mocked(createFitnessTest).mockRejectedValue(
      new InvalidFitnessTestError('nope')
    );
    const res = await request(app).post('/api/v2/fitness-tests').send(body);
    expect(res.status).toBe(400);
  });

  it('answers 404 for an activity that is not the persons', async () => {
    vi.mocked(createFitnessTest).mockRejectedValue(
      new UnknownExerciseEntryError()
    );
    const res = await request(app)
      .post('/api/v2/fitness-tests')
      .send({ ...body, exercise_entry_id: test.id });
    expect(res.status).toBe(404);
  });

  it('deletes a test, and 404s for one that is gone', async () => {
    vi.mocked(deleteFitnessTest).mockResolvedValueOnce(true);
    const ok = await request(app).delete(`/api/v2/fitness-tests/${test.id}`);
    expect(ok.status).toBe(204);
    vi.mocked(deleteFitnessTest).mockResolvedValueOnce(false);
    const gone = await request(app).delete(`/api/v2/fitness-tests/${test.id}`);
    expect(gone.status).toBe(404);
    const bad = await request(app).delete('/api/v2/fitness-tests/abc');
    expect(bad.status).toBe(400);
  });

  it('is owner-only: a delegated context is refused', async () => {
    actingAs = 'someone-else';
    for (const res of [
      await request(app).get('/api/v2/fitness-tests'),
      await request(app).get('/api/v2/fitness-tests/latest'),
      await request(app).post('/api/v2/fitness-tests').send(body),
      await request(app).delete(`/api/v2/fitness-tests/${test.id}`),
    ]) {
      expect(res.status).toBe(403);
    }
    expect(listFitnessTests).not.toHaveBeenCalled();
    expect(createFitnessTest).not.toHaveBeenCalled();
  });
});
