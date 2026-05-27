import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import AllergenPreferenceService from '../services/allergenPreferenceService.js';
import allergenPreferenceRoutes from '../routes/allergenPreferenceRoutes.js';

vi.mock('../services/allergenPreferenceService.js', () => ({
  default: {
    getAllergenPreferences: vi.fn(),
    addAllergenPreference: vi.fn(),
    deleteAllergenPreference: vi.fn(),
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
app.use('/api/allergen-preferences', allergenPreferenceRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

const VALID_UUID = uuidv4();

describe('Allergen Preference Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/allergen-preferences', () => {
    it('should return all allergen preferences for the user', async () => {
      const preferences = [
        { id: VALID_UUID, user_id: 'test-user-id', allergen_name: 'gluten' },
        { id: uuidv4(), user_id: 'test-user-id', allergen_name: 'milk' },
      ];
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.getAllergenPreferences.mockResolvedValue(
        preferences
      );

      const res = await request(app).get('/api/allergen-preferences');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(preferences);
      expect(
        AllergenPreferenceService.getAllergenPreferences
      ).toHaveBeenCalledWith('test-user-id');
    });

    it('should return an empty array when the user has no preferences', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.getAllergenPreferences.mockResolvedValue([]);

      const res = await request(app).get('/api/allergen-preferences');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual([]);
    });

    it('should return 500 on unexpected service error', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on type
      AllergenPreferenceService.getAllergenPreferences.mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app).get('/api/allergen-preferences');

      expect(res.statusCode).toEqual(500);
    });
  });

  describe('POST /api/allergen-preferences', () => {
    it('should create an allergen preference and return 201', async () => {
      const created = {
        id: VALID_UUID,
        user_id: 'test-user-id',
        allergen_name: 'gluten',
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.addAllergenPreference.mockResolvedValue(
        created
      );

      const res = await request(app)
        .post('/api/allergen-preferences')
        .send({ allergen_name: 'gluten' });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(created);
      expect(
        AllergenPreferenceService.addAllergenPreference
      ).toHaveBeenCalledWith('test-user-id', 'gluten');
    });

    it('should trim whitespace from allergen_name before saving', async () => {
      const created = {
        id: VALID_UUID,
        user_id: 'test-user-id',
        allergen_name: 'milk',
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.addAllergenPreference.mockResolvedValue(
        created
      );

      await request(app)
        .post('/api/allergen-preferences')
        .send({ allergen_name: '  milk  ' });

      expect(
        AllergenPreferenceService.addAllergenPreference
      ).toHaveBeenCalledWith('test-user-id', 'milk');
    });

    it('should return 400 when allergen_name is missing', async () => {
      const res = await request(app).post('/api/allergen-preferences').send({});

      expect(res.statusCode).toEqual(400);
      expect(
        AllergenPreferenceService.addAllergenPreference
      ).not.toHaveBeenCalled();
    });

    it('should return 400 when allergen_name is not a string', async () => {
      const res = await request(app)
        .post('/api/allergen-preferences')
        .send({ allergen_name: 123 });

      expect(res.statusCode).toEqual(400);
      expect(
        AllergenPreferenceService.addAllergenPreference
      ).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected service error', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on type
      AllergenPreferenceService.addAllergenPreference.mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app)
        .post('/api/allergen-preferences')
        .send({ allergen_name: 'gluten' });

      expect(res.statusCode).toEqual(500);
    });
  });

  describe('DELETE /api/allergen-preferences/:id', () => {
    it('should remove an allergen preference and return 200', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.deleteAllergenPreference.mockResolvedValue(
        true
      );

      const res = await request(app).delete(
        `/api/allergen-preferences/${VALID_UUID}`
      );

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty(
        'message',
        'Allergen preference removed.'
      );
      expect(
        AllergenPreferenceService.deleteAllergenPreference
      ).toHaveBeenCalledWith('test-user-id', VALID_UUID);
    });

    it('should return 404 when the preference does not exist', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type
      AllergenPreferenceService.deleteAllergenPreference.mockResolvedValue(
        false
      );

      const res = await request(app).delete(
        `/api/allergen-preferences/${VALID_UUID}`
      );

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty(
        'message',
        'Allergen preference not found.'
      );
    });

    it('should return 500 on unexpected service error', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on type
      AllergenPreferenceService.deleteAllergenPreference.mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app).delete(
        `/api/allergen-preferences/${VALID_UUID}`
      );

      expect(res.statusCode).toEqual(500);
    });
  });
});
