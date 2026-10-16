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

  // --- PUT /onboarding/target-weight ---
  describe('PUT /onboarding/target-weight', () => {
    it('saves a target weight in kg', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.setTargetWeight.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/onboarding/target-weight')
        .send({ targetWeight: 82.5 });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ targetWeight: 82.5 });
      expect(onboardingService.setTargetWeight).toHaveBeenCalledWith(
        'testUserId',
        82.5
      );
    });

    it('rounds to the two decimals the column stores', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.setTargetWeight.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/onboarding/target-weight')
        .send({ targetWeight: 82.456 });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ targetWeight: 82.46 });
      expect(onboardingService.setTargetWeight).toHaveBeenCalledWith(
        'testUserId',
        82.46
      );
    });

    it('clears the target weight with null', async () => {
      // @ts-expect-error TS(2339)
      onboardingService.setTargetWeight.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/onboarding/target-weight')
        .send({ targetWeight: null });

      expect(res.statusCode).toEqual(200);
      expect(onboardingService.setTargetWeight).toHaveBeenCalledWith(
        'testUserId',
        null
      );
    });

    it.each([
      { targetWeight: 0 },
      { targetWeight: -5 },
      { targetWeight: 1000 },
      { targetWeight: 999.996 },
      { targetWeight: 0.001 },
      { targetWeight: '80' },
      {},
    ])('rejects %j with 400', async (body) => {
      const res = await request(app)
        .put('/onboarding/target-weight')
        .send(body);

      expect(res.statusCode).toEqual(400);
      expect(onboardingService.setTargetWeight).not.toHaveBeenCalled();
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
