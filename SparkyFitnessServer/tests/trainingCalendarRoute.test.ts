import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import { CalendarEntryLimitError } from '../utils/errors.js';
import { trainingCalendarResponseSchema } from '@workspace/shared';

const { getTrainingCalendar, canAccessUserData } = vi.hoisted(() => ({
  getTrainingCalendar: vi.fn(),
  canAccessUserData: vi.fn(),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));
vi.mock('../services/reportService.js', () => ({ default: {} }));
vi.mock('../services/trainingCalendarService.js', () => ({
  default: { getTrainingCalendar },
}));
vi.mock('../utils/permissionUtils.js', () => ({ canAccessUserData }));

import reportRoutes from '../routes/reportRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const none = {
  running: 0,
  cycling: 0,
  walking: 0,
  cardio: 0,
  strength: 0,
  other: 0,
};
const body = {
  start: '2026-10-12',
  end: '2026-10-18',
  today: '2026-10-14',
  planned: [
    {
      id: 'runProgram:2026-10-14:3',
      day: '2026-10-14',
      source: 'runProgram',
      sport: 'running',
      label: null,
      programId: 'beginner5k',
      workoutNumber: 4,
      plannedMinutes: 25,
      plannedLoad: 50,
      status: 'upcoming',
      completedMinutes: 0,
      completedLoad: 0,
      entryIds: [],
    },
  ],
  completed: [],
  weeks: [],
  sportLoad: {
    weeks: [{ start: '2026-10-12', bySport: none }],
    months: [{ month: '2026-10', bySport: none }],
    total: none,
  },
  fitnessFatigue: { today: null, status: 'noData' },
};
const url = '/api/reports/training-calendar';

beforeEach(() => {
  vi.clearAllMocks();
  canAccessUserData.mockResolvedValue(true);
  getTrainingCalendar.mockResolvedValue(body);
});

describe('GET /api/reports/training-calendar', () => {
  it('returns the calendar for the acting user', async () => {
    const res = await request(app).get(
      `${url}?start=2026-10-12&end=2026-10-18`
    );
    expect(res.status).toBe(200);
    expect(trainingCalendarResponseSchema.safeParse(res.body).success).toBe(
      true
    );
    expect(getTrainingCalendar).toHaveBeenCalledWith(
      'test-user-id',
      'test-user-id',
      '2026-10-12',
      '2026-10-18'
    );
    expect(canAccessUserData).not.toHaveBeenCalled();
  });

  it.each([
    ['no range', ''],
    ['a day that does not exist', '?start=2026-02-30&end=2026-03-05'],
    ['an end before the start', '?start=2026-10-18&end=2026-10-12'],
    ['a range over 120 days', '?start=2026-01-01&end=2026-06-01'],
  ])('rejects %s', async (_name, query) => {
    const res = await request(app).get(`${url}${query}`);
    expect(res.status).toBe(400);
    expect(getTrainingCalendar).not.toHaveBeenCalled();
  });

  it('checks the reports permission before reading another user', async () => {
    const res = await request(app).get(
      `${url}?start=2026-10-12&end=2026-10-18&userId=other-user`
    );
    expect(res.status).toBe(200);
    expect(canAccessUserData).toHaveBeenCalledWith(
      'other-user',
      'reports',
      'test-user-id'
    );
    expect(getTrainingCalendar).toHaveBeenCalledWith(
      'test-user-id',
      'other-user',
      '2026-10-12',
      '2026-10-18'
    );
  });

  it('refuses another user without the permission', async () => {
    canAccessUserData.mockResolvedValue(false);
    const res = await request(app).get(
      `${url}?start=2026-10-12&end=2026-10-18&userId=other-user`
    );
    expect(res.status).toBe(403);
    expect(getTrainingCalendar).not.toHaveBeenCalled();
  });

  it('answers 400 instead of a calendar built from a truncated diary', async () => {
    getTrainingCalendar.mockRejectedValueOnce(
      new CalendarEntryLimitError(5000)
    );
    const res = await request(app).get(
      `${url}?start=2026-10-12&end=2026-10-18`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/more than 5000 workouts/);
  });
});
