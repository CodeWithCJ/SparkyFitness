import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import onboardingRoutes from '../routes/onboardingRoutes.js';
import onboardingService from '../services/onboardingService.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/onboardingService.js');
vi.mock('../middleware/authMiddleware', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
}));

const app = express();
app.use(express.json());
app.use('/onboarding', onboardingRoutes);
app.use(errorHandler);

describe('Onboarding Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- POST /onboarding ---
  describe('POST /onboarding', () => {
    const validPayload = {
      sex: 'male',
      primaryGoal: 'lose_weight',
      currentWeight: 80,
      height: 180,
      birthDate: '1990-01-01',
      activityLevel: 'moderate',
      targetWeight: 75,
    };

    it('should complete onboarding and return 201', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.processOnboardingData.mockResolvedValue(undefined);

      const res = await request(app).post('/onboarding').send(validPayload);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual({
        message: 'Onboarding completed successfully.',
      });
      expect(onboardingService.processOnboardingData).toHaveBeenCalledWith(
        'testUserId',
        validPayload
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/onboarding')
        .send({ sex: 'female' }); // missing most required fields

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 500 when service throws', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.processOnboardingData.mockRejectedValue(
        new Error('DB failure')
      );

      const res = await request(app).post('/onboarding').send(validPayload);

      expect(res.statusCode).toEqual(500);
    });
  });

  // --- GET /onboarding/status ---
  describe('GET /onboarding/status', () => {
    it('should return onboardingComplete and onboardingSkipped when not complete', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.checkOnboardingStatus.mockResolvedValue({
        onboarding_complete: false,
        onboarding_skipped: false,
      });

      const res = await request(app).get('/onboarding/status');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        onboardingComplete: false,
        onboardingSkipped: false,
      });
    });

    it('should return onboardingComplete=true when complete', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.checkOnboardingStatus.mockResolvedValue({
        onboarding_complete: true,
        onboarding_skipped: false,
      });

      const res = await request(app).get('/onboarding/status');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        onboardingComplete: true,
        onboardingSkipped: false,
      });
    });

    it('should return onboardingSkipped=true when user has skipped', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.checkOnboardingStatus.mockResolvedValue({
        onboarding_complete: false,
        onboarding_skipped: true,
      });

      const res = await request(app).get('/onboarding/status');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        onboardingComplete: false,
        onboardingSkipped: true,
      });
    });

    it('should return 500 when service throws', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.checkOnboardingStatus.mockRejectedValue(
        new Error('DB failure')
      );

      const res = await request(app).get('/onboarding/status');

      expect(res.statusCode).toEqual(500);
    });
  });

  // --- POST /onboarding/skip ---
  describe('POST /onboarding/skip', () => {
    it('should skip onboarding and return 200', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.skipOnboarding.mockResolvedValue(undefined);

      const res = await request(app).post('/onboarding/skip');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ message: 'Onboarding skipped successfully.' });
      expect(onboardingService.skipOnboarding).toHaveBeenCalledWith(
        'testUserId'
      );
    });

    it('should return 500 when service throws', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.skipOnboarding.mockRejectedValue(
        new Error('DB failure')
      );

      const res = await request(app).post('/onboarding/skip');

      expect(res.statusCode).toEqual(500);
    });
  });

  // --- POST /onboarding/reset ---
  describe('POST /onboarding/reset', () => {
    it('should reset onboarding and return 200', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.resetOnboardingStatus.mockResolvedValue(undefined);

      const res = await request(app).post('/onboarding/reset');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({
        message: 'Onboarding status reset successfully.',
      });
    });

    it('should return 500 when service throws', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.resetOnboardingStatus.mockRejectedValue(
        new Error('DB failure')
      );

      const res = await request(app).post('/onboarding/reset');

      expect(res.statusCode).toEqual(500);
    });
  });
});
