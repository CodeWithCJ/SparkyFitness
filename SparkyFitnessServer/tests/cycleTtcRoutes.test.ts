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

describe('Cycle TTC Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /tests creates a test entry', async () => {
    const entry = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      user_id: 'testUser',
      entry_date: '2026-03-12',
      test_type: 'opk',
      result: 'peak',
      notes: null,
    };
    vi.mocked(cycleRepository.createTestEntry).mockResolvedValue(entry);

    const res = await request(app)
      .post('/api/v2/cycle/tests')
      .send({ entry_date: '2026-03-12', test_type: 'opk', result: 'peak' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(entry);
    expect(cycleRepository.createTestEntry).toHaveBeenCalledWith('testUser', {
      entry_date: '2026-03-12',
      test_type: 'opk',
      result: 'peak',
    });
  });

  it('POST /tests rejects invalid test_type', async () => {
    const res = await request(app).post('/api/v2/cycle/tests').send({
      entry_date: '2026-03-12',
      test_type: 'blood-test',
      result: 'positive',
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /tests returns tests in date range', async () => {
    const list = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        entry_date: '2026-03-12',
        test_type: 'opk',
        result: 'peak',
      },
    ];
    vi.mocked(cycleRepository.listTestEntries).mockResolvedValue(list);

    const res = await request(app)
      .get('/api/v2/cycle/tests')
      .query({ startDate: '2026-03-01', endDate: '2026-03-31' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(list);
    expect(cycleRepository.listTestEntries).toHaveBeenCalledWith(
      'testUser',
      '2026-03-01',
      '2026-03-31'
    );
  });

  it('DELETE /tests/:id deletes a test entry', async () => {
    vi.mocked(cycleRepository.deleteTestEntry).mockResolvedValue(true);

    const res = await request(app).delete(
      '/api/v2/cycle/tests/550e8400-e29b-41d4-a716-446655440001'
    );

    expect(res.statusCode).toBe(204);
    expect(cycleRepository.deleteTestEntry).toHaveBeenCalledWith(
      'testUser',
      '550e8400-e29b-41d4-a716-446655440001'
    );
  });

  it('DELETE /tests/:id returns 404 if not found', async () => {
    vi.mocked(cycleRepository.deleteTestEntry).mockResolvedValue(false);

    const res = await request(app).delete(
      '/api/v2/cycle/tests/550e8400-e29b-41d4-a716-446655440002'
    );

    expect(res.statusCode).toBe(404);
  });

  it('GET /fertility returns computed fertility data', async () => {
    const data = {
      ovulationEstimate: {
        date: '2026-03-15',
        basis: 'calendar',
        confidence: 'medium',
      },
      conceptionProbability: { probability: 0.1, band: 'medium' },
      fertileWindowSeries: [],
      dpo: null,
      bbtShiftStatus: {
        coverline: null,
        confirmedOvulationDate: null,
        isConfirmed: false,
      },
    };
    vi.mocked(cycleService.getFertility).mockResolvedValue(data as any);

    const res = await request(app)
      .get('/api/v2/cycle/fertility')
      .query({ date: '2026-03-10' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(data);
    expect(cycleService.getFertility).toHaveBeenCalledWith(
      'testUser',
      '2026-03-10'
    );
  });
});
