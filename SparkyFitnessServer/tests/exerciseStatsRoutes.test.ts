import { vi, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
// @ts-expect-error TS(7016): no type declarations shipped for supertest
import request from 'supertest';
import exerciseStatsService from '../services/exerciseStatsService.js';
import exerciseStatsRoutes from '../routes/exerciseStatsRoutes.js';
import { canAccessUserData } from '../utils/permissionUtils.js';

vi.mock('../services/exerciseStatsService.js', () => ({
  default: {
    getPersonalRecordMatrix: vi.fn(),
    getMatchedCourses: vi.fn(),
    getStrengthSummary: vi.fn(),
  },
}));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn().mockResolvedValue(true),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  // types/express.d.ts augments Request with userId/authenticatedUserId, so
  // this mock needs no `any` casts to stand in for the real middleware.
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/exercise-stats', exerciseStatsRoutes);

const prMatrix = { cardioPRs: [], strength1RMs: [] };
const courses = { courses: [] };

beforeEach(() => {
  vi.clearAllMocks();
  (
    exerciseStatsService.getPersonalRecordMatrix as ReturnType<typeof vi.fn>
  ).mockResolvedValue(prMatrix);
  (
    exerciseStatsService.getMatchedCourses as ReturnType<typeof vi.fn>
  ).mockResolvedValue(courses);
});

// The routes advertise unitSystem as an enum. Casting the raw query string
// instead of validating it made `unitSystem=invalid` silently fall through to
// metric, so a caller who misspelled "imperial" got the wrong units back with
// a 200 and no indication anything was wrong.
describe.each([
  ['/exercise-stats/prs', 'getPersonalRecordMatrix'] as const,
  ['/exercise-stats/matched-courses', 'getMatchedCourses'] as const,
])('GET %s unitSystem validation', (path, serviceMethod) => {
  it('defaults to metric when unitSystem is omitted', async () => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(exerciseStatsService[serviceMethod]).toHaveBeenCalledWith(
      'user-123',
      'metric'
    );
  });

  it.each(['metric', 'imperial'])('accepts %s', async (unitSystem) => {
    const res = await request(app).get(`${path}?unitSystem=${unitSystem}`);
    expect(res.status).toBe(200);
    expect(exerciseStatsService[serviceMethod]).toHaveBeenCalledWith(
      'user-123',
      unitSystem
    );
  });

  it('rejects an unsupported unitSystem with 400', async () => {
    const res = await request(app).get(`${path}?unitSystem=invalid`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unitSystem/i);
    expect(exerciseStatsService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('rejects a repeated unitSystem parameter with 400', async () => {
    // Express parses ?a=1&a=2 into an array, which is not the documented enum.
    const res = await request(app).get(
      `${path}?unitSystem=metric&unitSystem=imperial`
    );
    expect(res.status).toBe(400);
    expect(exerciseStatsService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('rejects a casing variant with 400', async () => {
    const res = await request(app).get(`${path}?unitSystem=Imperial`);
    expect(res.status).toBe(400);
    expect(exerciseStatsService[serviceMethod]).not.toHaveBeenCalled();
  });
});

describe('GET /exercise-stats/strength-summary', () => {
  const summary = {
    lifetime: { volumeKg: 0, sets: 0, reps: 0, sessions: 0, firstDate: null },
    bodyweightKg: null,
    lifts: [],
  };

  it("returns the signed-in person's summary", async () => {
    (
      exerciseStatsService.getStrengthSummary as ReturnType<typeof vi.fn>
    ).mockResolvedValue(summary);
    const res = await request(app).get('/exercise-stats/strength-summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
    expect(exerciseStatsService.getStrengthSummary).toHaveBeenCalledWith(
      'user-123'
    );
  });

  it("refuses someone else's without reports permission", async () => {
    vi.mocked(canAccessUserData).mockResolvedValueOnce(false);
    const res = await request(app).get(
      '/exercise-stats/strength-summary?userId=other-user'
    );
    expect(res.status).toBe(403);
    expect(exerciseStatsService.getStrengthSummary).not.toHaveBeenCalled();
  });
});
