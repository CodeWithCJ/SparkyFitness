import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import fastingRoutes from '../routes/fastingRoutes.js';
import fastingRepository from '../models/fastingRepository.js';

// Mock repositories and middleware
vi.mock('../models/fastingRepository.js');
vi.mock('../models/moodRepository.js');
vi.mock('../utils/timezoneLoader.js');

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use(express.json());
app.use('/fasting', fastingRoutes);

describe('Fasting Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PUT /fasting/:id', () => {
    it('should update fast details and recalculate duration_minutes', async () => {
      const mockFast = {
        id: 'fast-id',
        user_id: 'testUserId',
        start_time: '2026-07-18T10:00:00.000Z',
        end_time: '2026-07-18T16:00:00.000Z',
        duration_minutes: 360,
        fasting_type: '16:8 Leangains',
        status: 'COMPLETED',
      };

      const mockUpdatedFast = {
        ...mockFast,
        start_time: '2026-07-18T09:00:00.000Z',
        duration_minutes: 420,
      };

      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(mockFast);
      // @ts-expect-error TS(2339)
      fastingRepository.updateFast.mockResolvedValue(mockUpdatedFast);

      const res = await request(app).put('/fasting/fast-id').send({
        start_time: '2026-07-18T09:00:00.000Z',
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockUpdatedFast);
      expect(fastingRepository.updateFast).toHaveBeenCalledWith(
        'fast-id',
        'testUserId',
        expect.objectContaining({
          start_time: '2026-07-18T09:00:00.000Z',
          duration_minutes: 420,
        })
      );
    });

    it('should return 400 error if start_time is after end_time', async () => {
      const mockFast = {
        id: 'fast-id',
        user_id: 'testUserId',
        start_time: '2026-07-18T10:00:00.000Z',
        end_time: '2026-07-18T16:00:00.000Z',
        duration_minutes: 360,
      };

      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(mockFast);

      const res = await request(app).put('/fasting/fast-id').send({
        start_time: '2026-07-18T17:00:00.000Z',
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('start_time must be before end_time');
    });

    it('should nullify duration_minutes if end_time is nullified', async () => {
      const mockFast = {
        id: 'fast-id',
        user_id: 'testUserId',
        start_time: '2026-07-18T10:00:00.000Z',
        end_time: '2026-07-18T16:00:00.000Z',
        duration_minutes: 360,
      };

      const mockUpdatedFast = {
        ...mockFast,
        end_time: null,
        duration_minutes: null,
        status: 'ACTIVE',
      };

      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(mockFast);
      // @ts-expect-error TS(2339)
      fastingRepository.updateFast.mockResolvedValue(mockUpdatedFast);

      const res = await request(app).put('/fasting/fast-id').send({
        end_time: null,
        status: 'ACTIVE',
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.duration_minutes).toBeNull();
      expect(fastingRepository.updateFast).toHaveBeenCalledWith(
        'fast-id',
        'testUserId',
        expect.objectContaining({
          end_time: null,
          duration_minutes: null,
        })
      );
    });

    it('should return 404 if fast does not exist', async () => {
      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(null);

      const res = await request(app)
        .put('/fasting/nonexistent-id')
        .send({ fasting_type: '16:8 Leangains' });

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toContain('Fast not found');
    });
  });

  describe('DELETE /fasting/:id', () => {
    it('should delete fast successfully and return 200', async () => {
      const mockDeletedFast = {
        id: 'fast-id',
        user_id: 'testUserId',
        start_time: '2026-07-18T10:00:00.000Z',
      };

      // @ts-expect-error TS(2339)
      fastingRepository.deleteFastingLog.mockResolvedValue(mockDeletedFast);

      const res = await request(app).delete('/fasting/fast-id');

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toContain('deleted successfully');
      expect(res.body.deletedFast).toEqual(mockDeletedFast);
      expect(fastingRepository.deleteFastingLog).toHaveBeenCalledWith(
        'fast-id',
        'testUserId'
      );
    });

    it('should return 404 if fast does not exist during delete', async () => {
      // @ts-expect-error TS(2339)
      fastingRepository.deleteFastingLog.mockResolvedValue(null);

      const res = await request(app).delete('/fasting/nonexistent-id');

      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toContain('Fast not found');
    });
  });
});
