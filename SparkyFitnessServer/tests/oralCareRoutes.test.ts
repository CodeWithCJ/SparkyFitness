import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import oralCareRoutes from '../routes/v2/oralCareRoutes.js';
import * as oralCareService from '../services/oralCareService.js';

vi.mock('../services/oralCareService.js', () => ({
  MAX_HISTORY_DAYS: 366,
  getDaySummary: vi.fn(),
  getHistory: vi.fn(),
  getSessions: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

let actingUserId = 'owner';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'owner';
    req.authenticatedUserId = actingUserId;
    req.originalUserId = actingUserId;
    next();
  },
}));

const permissionTypes = vi.hoisted(() => [] as string[]);
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn((type: string) => {
    permissionTypes.push(type);
    return (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => next();
  }),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/oral-care', oralCareRoutes);
app.use(errorHandler);

const savedSession = {
  id: 's1',
  user_id: 'owner',
  entry_date: '2026-11-08',
  start_time: '2026-11-08T08:00:00.000Z',
  end_time: null,
  duration_seconds: 120,
  care_type: 'brushing',
  custom_label: null,
  provider: 'manual',
  external_id: null,
  notes: null,
  covered_by_sync: false,
  created_at: '2026-11-08T08:00:00.000Z',
  updated_at: '2026-11-08T08:00:00.000Z',
};

describe('oral care routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingUserId = 'owner';
  });

  it('guards every route with the check-in permission', () => {
    expect(permissionTypes).toContain('checkin');
  });

  it('rejects a day summary without a valid date', async () => {
    const res = await request(app).get(
      '/api/v2/oral-care/day-summary?date=2026-02-30'
    );
    expect(res.statusCode).toBe(400);
    expect(oralCareService.getDaySummary).not.toHaveBeenCalled();
  });

  it('returns the day summary for the active user', async () => {
    vi.mocked(oralCareService.getDaySummary).mockResolvedValue({
      entry_date: '2026-11-08',
    } as never);
    const res = await request(app).get(
      '/api/v2/oral-care/day-summary?date=2026-11-08'
    );
    expect(res.statusCode).toBe(200);
    expect(oralCareService.getDaySummary).toHaveBeenCalledWith(
      'owner',
      'owner',
      '2026-11-08'
    );
  });

  it('refuses a history range over 366 days or running backwards', async () => {
    const long = await request(app).get(
      '/api/v2/oral-care/history?startDate=2025-01-01&endDate=2026-11-08'
    );
    expect(long.statusCode).toBe(400);
    const backwards = await request(app).get(
      '/api/v2/oral-care/history?startDate=2026-11-08&endDate=2026-11-01'
    );
    expect(backwards.statusCode).toBe(400);
    expect(oralCareService.getHistory).not.toHaveBeenCalled();
  });

  it('logs a brush and defaults the type and provider', async () => {
    vi.mocked(oralCareService.createSession).mockResolvedValue(
      savedSession as never
    );
    const res = await request(app).post('/api/v2/oral-care/entries').send({
      entry_date: '2026-11-08',
      start_time: '2026-11-08T08:00:00.000Z',
      duration_seconds: 120,
    });
    expect(res.statusCode).toBe(201);
    expect(oralCareService.createSession).toHaveBeenCalledWith(
      'owner',
      'owner',
      expect.objectContaining({ care_type: 'brushing', provider: 'manual' })
    );
  });

  it('requires a name for an "other" session and refuses one otherwise', async () => {
    const missing = await request(app)
      .post('/api/v2/oral-care/entries')
      .send({ entry_date: '2026-11-08', care_type: 'other' });
    expect(missing.statusCode).toBe(400);
    const extra = await request(app).post('/api/v2/oral-care/entries').send({
      entry_date: '2026-11-08',
      care_type: 'flossing',
      custom_label: 'Water flosser',
    });
    expect(extra.statusCode).toBe(400);
    expect(oralCareService.createSession).not.toHaveBeenCalled();
  });

  it('does not let a client claim a health-store provider', async () => {
    const res = await request(app).post('/api/v2/oral-care/entries').send({
      entry_date: '2026-11-08',
      provider: 'HealthKit',
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses an end time before the start time', async () => {
    const res = await request(app).post('/api/v2/oral-care/entries').send({
      entry_date: '2026-11-08',
      start_time: '2026-11-08T08:05:00.000Z',
      end_time: '2026-11-08T08:00:00.000Z',
    });
    expect(res.statusCode).toBe(400);
  });

  it('turns a type/label check violation on update into a 400', async () => {
    vi.mocked(oralCareService.updateSession).mockRejectedValue(
      Object.assign(new Error('violates check constraint'), {
        code: '23514',
        constraint: 'chk_oral_care_sessions_custom_label',
      })
    );
    const res = await request(app)
      .put('/api/v2/oral-care/entries/s1')
      .send({ custom_label: 'Retainer' });
    expect(res.statusCode).toBe(400);
  });

  it('answers 404 for an unknown session', async () => {
    vi.mocked(oralCareService.updateSession).mockResolvedValue(null);
    vi.mocked(oralCareService.deleteSession).mockResolvedValue(false);
    const put = await request(app)
      .put('/api/v2/oral-care/entries/missing')
      .send({ notes: 'x' });
    expect(put.statusCode).toBe(404);
    const del = await request(app).delete('/api/v2/oral-care/entries/missing');
    expect(del.statusCode).toBe(404);
  });

  it('saves the goal for the owner', async () => {
    vi.mocked(oralCareService.saveSettings).mockResolvedValue({
      daily_target: 3,
      target_seconds: 150,
    });
    const res = await request(app)
      .put('/api/v2/oral-care/settings')
      .send({ daily_target: 3, target_seconds: 150 });
    expect(res.statusCode).toBe(200);
    expect(oralCareService.saveSettings).toHaveBeenCalledWith('owner', {
      daily_target: 3,
      target_seconds: 150,
    });
  });

  it('refuses a goal change from a delegate', async () => {
    actingUserId = 'delegate';
    const res = await request(app)
      .put('/api/v2/oral-care/settings')
      .send({ daily_target: 3, target_seconds: 150 });
    expect(res.statusCode).toBe(403);
    expect(oralCareService.saveSettings).not.toHaveBeenCalled();
  });

  it('refuses an out-of-range goal', async () => {
    const res = await request(app)
      .put('/api/v2/oral-care/settings')
      .send({ daily_target: 0, target_seconds: 120 });
    expect(res.statusCode).toBe(400);
  });
});
