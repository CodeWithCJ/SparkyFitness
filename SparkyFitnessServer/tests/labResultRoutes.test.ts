import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import labResultRoutes from '../routes/v2/labResultRoutes.js';
import * as labRepo from '../models/labResultRepository.js';

vi.mock('../models/labResultRepository.js', () => ({
  listLabMarkers: vi.fn(),
  createLabMarker: vi.fn(),
  updateLabMarker: vi.fn(),
  deleteLabMarker: vi.fn(),
  listLabResults: vi.fn(),
  listLatestLabResults: vi.fn(),
  getLabResultById: vi.fn(),
  createLabResult: vi.fn(),
  updateLabResult: vi.fn(),
  deleteLabResult: vi.fn(),
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

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
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
app.use('/api/v2/lab-results', labResultRoutes);
app.use(errorHandler);

const ID = uuidv4();
const result = {
  id: ID,
  user_id: 'test-user-id',
  marker_key: 'hba1c',
  custom_marker_id: null,
  entry_date: '2026-09-12',
  value_numeric: 5.1,
  value_text: null,
  unit: '%',
  ref_range_low: 4.8,
  ref_range_high: 5.6,
  lab_name: null,
  notes: null,
  source: 'manual' as const,
  created_at: '2026-09-12T10:00:00.000Z',
  updated_at: '2026-09-12T10:00:00.000Z',
};

describe('Lab result routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('markers', () => {
    it('lists the custom markers', async () => {
      vi.mocked(labRepo.listLabMarkers).mockResolvedValue([]);
      const res = await request(app).get('/api/v2/lab-results/markers');
      expect(res.statusCode).toBe(200);
      expect(labRepo.listLabMarkers).toHaveBeenCalledWith(
        'test-user-id',
        'test-user-id'
      );
    });

    it('rejects a reversed range', async () => {
      const res = await request(app)
        .post('/api/v2/lab-results/markers')
        .send({ name: 'ApoB', ref_range_low: 9, ref_range_high: 3 });
      expect(res.statusCode).toBe(400);
      expect(labRepo.createLabMarker).not.toHaveBeenCalled();
    });

    it('creates a marker', async () => {
      vi.mocked(labRepo.createLabMarker).mockResolvedValue({
        id: ID,
        user_id: 'test-user-id',
        name: 'ApoB',
        unit: 'mg/dL',
        ref_range_low: null,
        ref_range_high: 90,
        created_at: result.created_at,
        updated_at: result.updated_at,
      });
      const res = await request(app)
        .post('/api/v2/lab-results/markers')
        .send({ name: 'ApoB', unit: 'mg/dL', ref_range_high: 90 });
      expect(res.statusCode).toBe(201);
      expect(labRepo.createLabMarker).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'ApoB', unit: 'mg/dL' }),
        'test-user-id'
      );
    });

    it('returns 404 for a malformed or unknown marker id', async () => {
      expect(
        (await request(app).delete('/api/v2/lab-results/markers/nope'))
          .statusCode
      ).toBe(404);
      vi.mocked(labRepo.deleteLabMarker).mockResolvedValue(false);
      expect(
        (await request(app).delete(`/api/v2/lab-results/markers/${ID}`))
          .statusCode
      ).toBe(404);
    });
  });

  describe('entries', () => {
    it('lists with filters and a default limit', async () => {
      vi.mocked(labRepo.listLabResults).mockResolvedValue([result]);
      const res = await request(app).get(
        '/api/v2/lab-results/entries?markerKey=hba1c'
      );
      expect(res.statusCode).toBe(200);
      expect(labRepo.listLabResults).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ markerKey: 'hba1c', limit: 1000 }),
        'test-user-id'
      );
    });

    it('returns 400 for conflicting filters', async () => {
      const res = await request(app).get(
        `/api/v2/lab-results/entries?markerKey=hba1c&markerId=${ID}`
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns the latest result per marker', async () => {
      vi.mocked(labRepo.listLatestLabResults).mockResolvedValue([result]);
      const res = await request(app).get('/api/v2/lab-results/latest');
      expect(res.body).toHaveLength(1);
    });

    it('creates several results for one marker on one day', async () => {
      vi.mocked(labRepo.createLabResult).mockResolvedValue(result);
      const body = {
        marker_key: 'hba1c',
        entry_date: '2026-09-12',
        value_numeric: 5.1,
        unit: '%',
      };
      expect(
        (await request(app).post('/api/v2/lab-results/entries').send(body))
          .statusCode
      ).toBe(201);
      expect(
        (await request(app).post('/api/v2/lab-results/entries').send(body))
          .statusCode
      ).toBe(201);
      expect(labRepo.createLabResult).toHaveBeenCalledTimes(2);
    });

    it('returns 400 for an invalid body', async () => {
      const res = await request(app)
        .post('/api/v2/lab-results/entries')
        .send({ marker_key: 'hba1c', entry_date: '2026-09-12' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the custom marker is not the user’s', async () => {
      vi.mocked(labRepo.createLabResult).mockResolvedValue(null);
      const res = await request(app).post('/api/v2/lab-results/entries').send({
        custom_marker_id: ID,
        entry_date: '2026-09-12',
        value_numeric: 3,
      });
      expect(res.statusCode).toBe(400);
    });

    it('updates a result and 404s when it is missing', async () => {
      vi.mocked(labRepo.updateLabResult).mockResolvedValueOnce(result);
      expect(
        (
          await request(app)
            .put(`/api/v2/lab-results/entries/${ID}`)
            .send({ notes: 'fasting' })
        ).statusCode
      ).toBe(200);
      vi.mocked(labRepo.updateLabResult).mockResolvedValueOnce(null);
      expect(
        (
          await request(app)
            .put(`/api/v2/lab-results/entries/${ID}`)
            .send({ notes: 'fasting' })
        ).statusCode
      ).toBe(404);
    });

    it('answers a database range violation with 400, not 500', async () => {
      const dbError = Object.assign(new Error('violates check constraint'), {
        code: '23514',
        constraint: 'lab_results_ref_range_check',
      });
      vi.mocked(labRepo.updateLabResult).mockRejectedValue(dbError);
      const res = await request(app)
        .put(`/api/v2/lab-results/entries/${ID}`)
        .send({ ref_range_high: 5 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe(
        'ref_range_low must not exceed ref_range_high'
      );
    });

    it('deletes a result', async () => {
      vi.mocked(labRepo.deleteLabResult).mockResolvedValue(true);
      const res = await request(app).delete(
        `/api/v2/lab-results/entries/${ID}`
      );
      expect(res.statusCode).toBe(200);
    });
  });
});
