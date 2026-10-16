import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import fastingRoutes from '../routes/fastingRoutes.js';
import fastingRepository from '../models/fastingRepository.js';
import fastingPreferencesRepository from '../models/fastingPreferencesRepository.js';
import fastingAutoCalculationService from '../services/fastingAutoCalculationService.js';
import moodRepository from '../models/moodRepository.js';

// Mock repositories and middleware
vi.mock('../models/fastingRepository.js');
vi.mock('../models/fastingPreferencesRepository.js');
vi.mock('../services/fastingAutoCalculationService.js');
vi.mock('../models/moodRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

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

  describe('POST /fasting/end mood', () => {
    const endTime = '2026-07-18T16:00:00.000Z';
    const activeFast = {
      id: 'fast-id',
      user_id: 'testUserId',
      start_time: '2026-07-18T00:00:00.000Z',
    };

    it('brings the mood into the range the mood column carries', async () => {
      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(activeFast);
      // @ts-expect-error TS(2339)
      fastingRepository.endFast.mockResolvedValue({ id: 'fast-id' });

      const res = await request(app)
        .post('/fasting/end')
        .send({ id: 'fast-id', end_time: endTime, mood: { value: 8 } });

      expect(res.statusCode).toEqual(200);
      expect(moodRepository.createOrUpdateMoodEntry).toHaveBeenCalledWith(
        'testUserId',
        10,
        '',
        endTime
      );
    });

    it('clamps the mood on the auto-calculated fast too', async () => {
      // @ts-expect-error TS(2339)
      fastingAutoCalculationService.getCurrentAutoFast.mockResolvedValue({
        start_time: '2026-07-18T00:00:00.000Z',
      });
      // @ts-expect-error TS(2339)
      fastingRepository.createCompletedFast.mockResolvedValue({ id: 'auto' });

      const res = await request(app)
        .post('/fasting/end')
        .send({
          id: 'auto-current',
          end_time: endTime,
          mood: { value: 150, notes: 'Done' },
        });

      expect(res.statusCode).toEqual(200);
      expect(moodRepository.createOrUpdateMoodEntry).toHaveBeenCalledWith(
        'testUserId',
        100,
        'Done',
        endTime
      );
    });

    it('rejects a mood that is not a number before ending anything', async () => {
      const res = await request(app)
        .post('/fasting/end')
        .send({ id: 'fast-id', end_time: endTime, mood: { value: 'great' } });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBe('Mood value must be a number');
      expect(fastingRepository.getFastingById).not.toHaveBeenCalled();
      expect(fastingRepository.endFast).not.toHaveBeenCalled();
      expect(moodRepository.createOrUpdateMoodEntry).not.toHaveBeenCalled();
    });

    it('ends the fast without logging a mood that carries no value', async () => {
      // @ts-expect-error TS(2339)
      fastingRepository.getFastingById.mockResolvedValue(activeFast);
      // @ts-expect-error TS(2339)
      fastingRepository.endFast.mockResolvedValue({ id: 'fast-id' });

      const res = await request(app)
        .post('/fasting/end')
        .send({ id: 'fast-id', end_time: endTime, mood: { notes: 'Fine' } });

      expect(res.statusCode).toEqual(200);
      expect(fastingRepository.endFast).toHaveBeenCalled();
      expect(moodRepository.createOrUpdateMoodEntry).not.toHaveBeenCalled();
    });
  });

  describe('Fasting Preferences & Auto Calculation', () => {
    it('GET /fasting/preferences should return preferences', async () => {
      const mockPrefs = {
        user_id: 'testUserId',
        auto_calculate: true,
        default_protocol: '16-8',
        target_fasting_hours: 16,
        target_eating_hours: 8,
        calorie_threshold: 10,
        pre_end_alert_minutes: 30,
        eating_window_alert: false,
      };

      // @ts-expect-error TS(2339)
      fastingPreferencesRepository.getFastingPreferences.mockResolvedValue(
        mockPrefs
      );

      const res = await request(app).get('/fasting/preferences');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockPrefs);
    });

    it('PUT /fasting/preferences should update and return preferences', async () => {
      const updatedPrefs = {
        user_id: 'testUserId',
        auto_calculate: true,
        default_protocol: '18-6',
        target_fasting_hours: 18,
        target_eating_hours: 6,
        calorie_threshold: 15,
        pre_end_alert_minutes: 30,
        eating_window_alert: true,
      };

      // @ts-expect-error TS(2339)
      fastingPreferencesRepository.upsertFastingPreferences.mockResolvedValue(
        updatedPrefs
      );

      const res = await request(app)
        .put('/fasting/preferences')
        .send(updatedPrefs);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(updatedPrefs);
    });

    it('GET /fasting/calculated should return calculated history', async () => {
      const mockCalculated = [
        {
          id: 'auto-1',
          user_id: 'testUserId',
          start_time: '2026-10-02T19:00:00.000Z',
          end_time: '2026-10-03T11:00:00.000Z',
          target_end_time: '2026-10-03T11:00:00.000Z',
          duration_minutes: 960,
          fasting_type: '16:8 Leangains',
          status: 'COMPLETED',
          is_auto_calculated: true,
        },
      ];

      // @ts-expect-error TS(2339)
      fastingAutoCalculationService.getCalculatedFastingHistory.mockResolvedValue(
        mockCalculated
      );

      const res = await request(app).get(
        '/fasting/calculated?startDate=2026-10-01&endDate=2026-10-03'
      );
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockCalculated);
    });
  });
});
