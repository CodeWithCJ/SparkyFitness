import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import cycleRepository from '../models/cycleRepository.js';
import cycleService from '../services/cycleService.js';
import cycleRoutes from '../routes/v2/cycleRoutes.js';

vi.mock('../models/cycleRepository.js');
vi.mock('../services/cycleService.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.userId = 'testUser';
  next();
});
app.use('/api/v2/cycle', cycleRoutes);

describe('Cycle Routes V2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /settings returns settings', async () => {
    const settings = { id: '1', user_id: 'testUser', mode: 'standard' };
    vi.mocked(cycleRepository.getSettings).mockResolvedValue(settings);
    const res = await request(app).get('/api/v2/cycle/settings');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(settings);
  });

  it('PUT /settings upserts and marks onboarded', async () => {
    const saved = { id: '1', user_id: 'testUser', mode: 'ttc' };
    vi.mocked(cycleRepository.upsertSettings).mockResolvedValue(saved);
    const res = await request(app)
      .put('/api/v2/cycle/settings')
      .send({ mode: 'ttc', mark_onboarded: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(saved);
    expect(cycleRepository.upsertSettings).toHaveBeenCalledWith(
      'testUser',
      expect.objectContaining({ mode: 'ttc', mark_onboarded: true })
    );
  });

  it('PUT /settings rejects an invalid mode', async () => {
    const res = await request(app)
      .put('/api/v2/cycle/settings')
      .send({ mode: 'not-a-mode' });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /logs/:date upserts a log and recomputes cycles', async () => {
    const saved = { id: '9', entry_date: '2026-03-01', flow_level: 'medium' };
    vi.mocked(cycleRepository.upsertLog).mockResolvedValue(saved);
    vi.mocked(cycleRepository.getSettings).mockResolvedValue({
      birth_control_method: 'none',
    });
    vi.mocked(cycleService.recomputeCycles).mockResolvedValue([]);
    const res = await request(app)
      .put('/api/v2/cycle/logs/2026-03-01')
      .send({ flow_level: 'medium', product_usage: { pad: 2 } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(saved);
    expect(cycleService.recomputeCycles).toHaveBeenCalledWith(
      'testUser',
      'none'
    );
  });

  it('PUT /logs/:date rejects a bad date param', async () => {
    const res = await request(app)
      .put('/api/v2/cycle/logs/03-01-2026')
      .send({ flow_level: 'medium' });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /logs/:date rejects an out-of-range flow level', async () => {
    const res = await request(app)
      .put('/api/v2/cycle/logs/2026-03-01')
      .send({ flow_level: 'flooding' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /overview returns the composite payload', async () => {
    const overview = { date: '2026-03-01', phase: 'menstrual', cycleDay: 1 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(cycleService.getOverview).mockResolvedValue(overview as any);
    const res = await request(app).get('/api/v2/cycle/overview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(overview);
    expect(cycleService.getOverview).toHaveBeenCalledWith(
      'testUser',
      expect.any(String),
      undefined
    );
  });

  it('DELETE /logs/:date returns 404 when missing', async () => {
    vi.mocked(cycleRepository.deleteLog).mockResolvedValue(false);
    const res = await request(app).delete('/api/v2/cycle/logs/2026-03-01');
    expect(res.statusCode).toBe(404);
  });

  it('PUT /logs (bulk) updates multiple flow logs and recomputes', async () => {
    const overview = { date: '2026-03-01', phase: 'menstrual', cycleDay: 1 };
    vi.mocked(cycleRepository.bulkUpsertFlowLogs).mockResolvedValue(undefined);
    vi.mocked(cycleRepository.getSettings).mockResolvedValue({
      birth_control_method: 'none',
    });
    vi.mocked(cycleService.recomputeCycles).mockResolvedValue([]);
    vi.mocked(cycleService.getOverview).mockResolvedValue(overview as any);

    const res = await request(app)
      .put('/api/v2/cycle/logs')
      .send([
        { date: '2026-03-01', flow_level: 'medium' },
        { date: '2026-03-02', flow_level: 'light' },
      ]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(overview);
    expect(cycleRepository.bulkUpsertFlowLogs).toHaveBeenCalledWith(
      'testUser',
      [
        { date: '2026-03-01', flow_level: 'medium' },
        { date: '2026-03-02', flow_level: 'light' },
      ]
    );
  });

  it('POST /cycles creates a manual cycle and recomputes', async () => {
    const manualCycle = {
      id: 'm1',
      start_date: '2026-01-01',
      source: 'manual',
    };
    vi.mocked(cycleRepository.createManualCycle).mockResolvedValue(manualCycle);
    vi.mocked(cycleRepository.getSettings).mockResolvedValue({
      birth_control_method: 'none',
    });
    vi.mocked(cycleService.recomputeCycles).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v2/cycle/cycles')
      .send({ start_date: '2026-01-01', period_length: 5 });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(manualCycle);
    expect(cycleRepository.createManualCycle).toHaveBeenCalledWith('testUser', {
      start_date: '2026-01-01',
      period_length: 5,
    });
  });

  it('PUT /cycles/:id updates a cycle and recomputes', async () => {
    const updatedCycle = {
      id: 'm1',
      start_date: '2026-01-02',
      source: 'manual',
    };
    vi.mocked(cycleRepository.updateCycle).mockResolvedValue(updatedCycle);
    vi.mocked(cycleRepository.getSettings).mockResolvedValue({
      birth_control_method: 'none',
    });
    vi.mocked(cycleService.recomputeCycles).mockResolvedValue([]);

    const res = await request(app)
      .put('/api/v2/cycle/cycles/m1')
      .send({ start_date: '2026-01-02' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(updatedCycle);
    expect(cycleRepository.updateCycle).toHaveBeenCalledWith('testUser', 'm1', {
      start_date: '2026-01-02',
    });
  });

  it('DELETE /cycles/:id deletes a cycle and recomputes', async () => {
    vi.mocked(cycleRepository.deleteCycle).mockResolvedValue(true);
    vi.mocked(cycleRepository.getSettings).mockResolvedValue({
      birth_control_method: 'none',
    });
    vi.mocked(cycleService.recomputeCycles).mockResolvedValue([]);

    const res = await request(app).delete('/api/v2/cycle/cycles/m1');
    expect(res.statusCode).toBe(204);
    expect(cycleRepository.deleteCycle).toHaveBeenCalledWith('testUser', 'm1');
  });

  it('GET /insights returns computed insights data', async () => {
    const insights = {
      stats: {},
      accuracy: {},
      matrix: {},
      forecast: {},
      bbtSeries: [],
    };
    vi.mocked(cycleService.getInsights).mockResolvedValue(insights as any);

    const res = await request(app).get('/api/v2/cycle/insights');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(insights);
  });
});
