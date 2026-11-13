import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import runGoalRoutes from '../routes/v2/runGoalRoutes.js';
import { upsertRunGoals } from '../models/runGoalRepository.js';
import { getRunGoalsWithProgress } from '../services/runGoalService.js';

vi.mock('../models/runGoalRepository.js', () => {
  class InvalidRunGoalsError extends Error {}
  return { upsertRunGoals: vi.fn(), InvalidRunGoalsError };
});
vi.mock('../services/runGoalService.js', () => ({
  getRunGoalsWithProgress: vi.fn(),
}));

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
app.use('/api/v2/run-goals', runGoalRoutes);
app.use(errorHandler);

const response = {
  goals: {
    weekly_distance_km: 30,
    race_name: 'City 10K',
    race_date: '2026-11-15',
    race_distance_km: 10,
    updated_at: '2026-10-15T00:00:00.000Z',
  },
  progress: {
    week_start: '2026-10-12',
    week_end: '2026-10-18',
    week_distance_km: 12.5,
    run_count: 2,
    weekly_percent: 42,
    days_left_in_week: 4,
    daily_needed_km: 4.4,
    race_days_left: 31,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('run goal routes', () => {
  it('returns the goals with progress', async () => {
    vi.mocked(getRunGoalsWithProgress).mockResolvedValue(response);
    const res = await request(app).get('/api/v2/run-goals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(response);
    expect(getRunGoalsWithProgress).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id'
    );
  });

  it('saves the fields sent', async () => {
    vi.mocked(getRunGoalsWithProgress).mockResolvedValue(response);
    const res = await request(app)
      .put('/api/v2/run-goals')
      .send({ weekly_distance_km: 30, race_date: '2026-11-15' });
    expect(res.status).toBe(200);
    expect(upsertRunGoals).toHaveBeenCalledWith(
      'test-user-id',
      { weekly_distance_km: 30, race_date: '2026-11-15' },
      'test-user-id'
    );
  });

  it('lets a field be cleared with null', async () => {
    vi.mocked(getRunGoalsWithProgress).mockResolvedValue(response);
    const res = await request(app)
      .put('/api/v2/run-goals')
      .send({ weekly_distance_km: null });
    expect(res.status).toBe(200);
    expect(upsertRunGoals).toHaveBeenCalledWith(
      'test-user-id',
      { weekly_distance_km: null },
      'test-user-id'
    );
  });

  it.each([
    ['a zero target', { weekly_distance_km: 0 }],
    ['a target over 1000 km', { weekly_distance_km: 1001 }],
    ['a made-up day', { race_date: '2026-02-31' }],
    [
      'a race name with the race day cleared',
      { race_name: 'City 10K', race_date: null },
    ],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).put('/api/v2/run-goals').send(body);
    expect(res.status).toBe(400);
    expect(upsertRunGoals).not.toHaveBeenCalled();
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/run-goals');
    expect(res.status).toBe(403);
    expect(getRunGoalsWithProgress).not.toHaveBeenCalled();
  });
});
