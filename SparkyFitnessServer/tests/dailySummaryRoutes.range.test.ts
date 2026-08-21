import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 — no @types/supertest in project
import request from 'supertest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { getDailySummaryRange } from '../services/dailySummaryRangeService.js';
import { canAccessUserData } from '../utils/permissionUtils.js';

vi.mock('../services/dailySummaryRangeService.js', () => ({
  getDailySummaryRange: vi.fn(),
}));
vi.mock('../services/dailySummaryService.js', () => ({
  getDailySummary: vi.fn(),
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function buildApp(userId = ACTOR) {
  // The route module uses `module.exports = router`, so the ESM namespace exposes it
  // on `.default` at runtime while the type has no such property.
  const mod = (await import('../routes/dailySummaryRoutes.js')) as unknown as {
    default: express.Router;
  };
  const router = mod.default;
  const app = express();
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = userId;
    next();
  });
  app.use('/api/daily-summary', router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDailySummaryRange).mockResolvedValue({ days: [] });
  vi.mocked(canAccessUserData).mockResolvedValue(true);
});

describe('GET /daily-summary/range validation', () => {
  it('accepts a well-formed range', async () => {
    const app = await buildApp();
    const res = await request(app).get(
      '/api/daily-summary/range?startDate=2026-08-01&endDate=2026-08-20'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ days: [] });
  });

  it('rejects missing dates', async () => {
    const app = await buildApp();
    expect((await request(app).get('/api/daily-summary/range')).status).toBe(
      400
    );
    expect(
      (await request(app).get('/api/daily-summary/range?startDate=2026-08-01'))
        .status
    ).toBe(400);
  });

  /**
   * The digit-shape regex this route used to rely on accepted these. `Date.parse` then
   * returned NaN, the span check compared against NaN and passed, and the service threw
   * a RangeError building the day list — a 500 for a plainly bad request.
   */
  it.each(['2026-13-45', '2026-02-30', '2026-00-10', 'not-a-date'])(
    'rejects the calendar-invalid date %s',
    async (bad) => {
      const app = await buildApp();
      const res = await request(app).get(
        `/api/daily-summary/range?startDate=${bad}&endDate=2026-08-20`
      );

      expect(res.status).toBe(400);
      expect(getDailySummaryRange).not.toHaveBeenCalled();
    }
  );

  /**
   * Handler-level only. In the real stack `checkPermissionMiddleware` runs first and
   * hands the raw string to `canAccessUserData`, which fails a Postgres uuid cast and
   * yields a 500 — pre-existing behaviour shared by every route using that middleware,
   * including `GET /daily-summary`. The schema check still belongs here so the handler
   * is correct on its own terms, but it is not what a client sees today.
   */
  it('rejects a userId that is not a uuid', async () => {
    const app = await buildApp();
    const res = await request(app).get(
      '/api/daily-summary/range?startDate=2026-08-01&endDate=2026-08-02&userId=not-a-uuid'
    );

    expect(res.status).toBe(400);
    expect(getDailySummaryRange).not.toHaveBeenCalled();
  });

  it('rejects an inverted range', async () => {
    const app = await buildApp();
    const res = await request(app).get(
      '/api/daily-summary/range?startDate=2026-08-20&endDate=2026-08-01'
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must not be after/i);
    expect(getDailySummaryRange).not.toHaveBeenCalled();
  });

  it('rejects a span longer than 366 days', async () => {
    const app = await buildApp();
    const res = await request(app).get(
      '/api/daily-summary/range?startDate=2025-01-01&endDate=2026-08-20'
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/366 days/);
    expect(getDailySummaryRange).not.toHaveBeenCalled();
  });

  it('accepts exactly 366 days', async () => {
    const app = await buildApp();
    const res = await request(app).get(
      '/api/daily-summary/range?startDate=2026-01-01&endDate=2027-01-01'
    );

    expect(res.status).toBe(200);
  });
});

describe('GET /daily-summary/range access', () => {
  it('forbids a family viewer without diary permission', async () => {
    vi.mocked(canAccessUserData).mockResolvedValue(false);
    const app = await buildApp();
    const res = await request(app).get(
      `/api/daily-summary/range?startDate=2026-08-01&endDate=2026-08-02&userId=${OTHER}`
    );

    expect(res.status).toBe(403);
    expect(getDailySummaryRange).not.toHaveBeenCalled();
  });

  /**
   * Step calories and external BMR come from `check_in_measurements`, which needs the
   * `checkin` permission rather than `diary`. Reports must degrade exactly as the Diary
   * does, or the two disagree for precisely the viewers least able to explain why.
   */
  it('withholds check-in data from a viewer with diary but not checkin', async () => {
    vi.mocked(canAccessUserData).mockImplementation(
      async (_target: string, permission: string) => permission === 'diary'
    );
    const app = await buildApp();
    const res = await request(app).get(
      `/api/daily-summary/range?startDate=2026-08-01&endDate=2026-08-02&userId=${OTHER}`
    );

    expect(res.status).toBe(200);
    expect(getDailySummaryRange).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: OTHER, includeCheckin: false })
    );
  });

  it('allows check-in data for self access', async () => {
    const app = await buildApp();
    await request(app).get(
      '/api/daily-summary/range?startDate=2026-08-01&endDate=2026-08-02'
    );

    expect(getDailySummaryRange).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: ACTOR, includeCheckin: true })
    );
  });
});
