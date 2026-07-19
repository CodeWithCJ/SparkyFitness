import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import nutrientGoalPreferenceRoutes from '../routes/nutrientGoalPreferenceRoutes.js';

vi.mock('../services/nutrientGoalPreferenceService.js', () => ({
  default: {
    getEffectiveGoalTypes: vi.fn(),
    upsertGoalPreference: vi.fn(),
    resetGoalPreference: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/nutrient-goal-preferences', nutrientGoalPreferenceRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service = nutrientGoalPreferenceService as any;

describe('Nutrient Goal Preference Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/nutrient-goal-preferences', () => {
    it('returns the effective goal-direction map', async () => {
      const map = {
        sodium: { goalType: 'maximum' },
        protein: { goalType: 'minimum' },
        calories: { goalType: 'target', targetMin: 1700, targetMax: 1900 },
      };
      service.getEffectiveGoalTypes.mockResolvedValue(map);

      const res = await request(app).get('/api/nutrient-goal-preferences');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(map);
      expect(service.getEffectiveGoalTypes).toHaveBeenCalledWith(
        'test-user-id'
      );
    });

    it('returns 500 on unexpected service error', async () => {
      service.getEffectiveGoalTypes.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/nutrient-goal-preferences');

      expect(res.statusCode).toEqual(500);
    });
  });

  describe('PUT /api/nutrient-goal-preferences/:nutrientKey', () => {
    it('upserts a minimum preference and returns 200', async () => {
      const saved = {
        nutrient_key: 'protein',
        goal_type: 'minimum',
        target_min: null,
        target_max: null,
      };
      service.upsertGoalPreference.mockResolvedValue(saved);

      const res = await request(app)
        .put('/api/nutrient-goal-preferences/protein')
        .send({ goalType: 'minimum' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(saved);
      expect(service.upsertGoalPreference).toHaveBeenCalledWith(
        'test-user-id',
        'protein',
        'minimum',
        undefined,
        undefined
      );
    });

    it('upserts a valid target band and returns 200', async () => {
      const saved = {
        nutrient_key: 'calories',
        goal_type: 'target',
        target_min: 1700,
        target_max: 1900,
      };
      service.upsertGoalPreference.mockResolvedValue(saved);

      const res = await request(app)
        .put('/api/nutrient-goal-preferences/calories')
        .send({ goalType: 'target', targetMin: 1700, targetMax: 1900 });

      expect(res.statusCode).toEqual(200);
      expect(service.upsertGoalPreference).toHaveBeenCalledWith(
        'test-user-id',
        'calories',
        'target',
        1700,
        1900
      );
    });

    it('rejects an invalid goalType with 400 without calling the service', async () => {
      const res = await request(app)
        .put('/api/nutrient-goal-preferences/protein')
        .send({ goalType: 'bogus' });

      expect(res.statusCode).toEqual(400);
      expect(service.upsertGoalPreference).not.toHaveBeenCalled();
    });

    it('rejects a target goal missing its band with 400', async () => {
      const res = await request(app)
        .put('/api/nutrient-goal-preferences/calories')
        .send({ goalType: 'target' });

      expect(res.statusCode).toEqual(400);
      expect(service.upsertGoalPreference).not.toHaveBeenCalled();
    });

    it('rejects a target band where min > max with 400', async () => {
      const res = await request(app)
        .put('/api/nutrient-goal-preferences/calories')
        .send({ goalType: 'target', targetMin: 2000, targetMax: 1500 });

      expect(res.statusCode).toEqual(400);
      expect(service.upsertGoalPreference).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/nutrient-goal-preferences/:nutrientKey', () => {
    it('resets a preference and returns the built-in default', async () => {
      const result = { nutrientKey: 'sodium', goalType: 'maximum' };
      service.resetGoalPreference.mockResolvedValue(result);

      const res = await request(app).delete(
        '/api/nutrient-goal-preferences/sodium'
      );

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(result);
      expect(service.resetGoalPreference).toHaveBeenCalledWith(
        'test-user-id',
        'sodium'
      );
    });
  });
});
