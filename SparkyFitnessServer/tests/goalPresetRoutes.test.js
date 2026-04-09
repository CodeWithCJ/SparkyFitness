import request from 'supertest';
import express from 'express';
import goalPresetService from '../services/goalPresetService.js';
import goalPresetRoutes from '../routes/v2/goalPresetRoutes.js';
// Mock middleware and service
jest.mock('../services/goalPresetService');
jest.mock('../middleware/checkPermissionMiddleware', () =>
  jest.fn(() => (req, res, next) => next())
);
const app = express();
app.use(express.json());
// Add middleware to set userId for testing
app.use((req, res, next) => {
  // Extract userId from cookie for testing purposes
  if (req.headers.cookie && req.headers.cookie.includes('userId=')) {
    const userIdMatch = req.headers.cookie.match(/userId=([^;]+)/);
    if (userIdMatch) {
      req.userId = userIdMatch[1];
    }
  }
  next();
});
app.use('/api/v2/goal-presets', goalPresetRoutes);
describe('Goal Preset Routes V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('POST /api/v2/goal-presets', () => {
    it('should create a new goal preset', async () => {
      const newPreset = {
        id: 'test-id',
        preset_name: 'Test Preset',
        user_id: 'testUser',
        calories: 2000,
      };
      goalPresetService.createGoalPreset.mockResolvedValue(newPreset);
      const res = await request(app)
        .post('/api/v2/goal-presets')
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Test Preset',
          calories: 2000,
          protein: 150,
          carbs: 200,
          fat: 70,
          water_goal_ml: 2500,
          saturated_fat: 10,
          polyunsaturated_fat: 5,
          monounsaturated_fat: 8,
          trans_fat: 0,
          cholesterol: 300,
          sodium: 2300,
          potassium: 3500,
          dietary_fiber: 25,
          sugars: 50,
          vitamin_a: 900,
          vitamin_c: 90,
          calcium: 1300,
          iron: 18,
          target_exercise_calories_burned: 500,
          target_exercise_duration_minutes: 60,
          protein_percentage: 30,
          carbs_percentage: 40,
          fat_percentage: 30,
          breakfast_percentage: 25,
          lunch_percentage: 35,
          dinner_percentage: 30,
          snacks_percentage: 10,
          custom_nutrients: {},
        });
      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(newPreset);
      expect(goalPresetService.createGoalPreset).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({
          preset_name: 'Test Preset',
          calories: 2000,
        })
      );
    });
    it('should return 409 Conflict for duplicate preset name', async () => {
      goalPresetService.createGoalPreset.mockRejectedValue(
        new Error('A goal preset with this name already exists.')
      );
      const res = await request(app)
        .post('/api/v2/goal-presets')
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Duplicate Preset',
          calories: 2000,
          protein: 150,
          carbs: 200,
          fat: 70,
          water_goal_ml: 2500,
          protein_percentage: null,
          carbs_percentage: null,
          fat_percentage: null,
          saturated_fat: null,
          polyunsaturated_fat: null,
          monounsaturated_fat: null,
          trans_fat: null,
          cholesterol: null,
          sodium: null,
          potassium: null,
          dietary_fiber: null,
          sugars: null,
          vitamin_a: null,
          vitamin_c: null,
          calcium: null,
          iron: null,
          target_exercise_calories_burned: null,
          target_exercise_duration_minutes: null,
          breakfast_percentage: null,
          lunch_percentage: null,
          dinner_percentage: null,
          snacks_percentage: null,
          custom_nutrients: null,
        });
      expect(res.statusCode).toEqual(409);
      expect(res.body).toEqual({
        error: 'A goal preset with this name already exists.',
      });
    });
    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/v2/goal-presets')
        .set('Cookie', ['userId=testUser'])
        .send({
          // Missing required preset_name
          calories: 2000,
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Invalid request body');
      expect(res.body).toHaveProperty('details');
    });
  });
  describe('GET /api/v2/goal-presets', () => {
    it('should return all goal presets for the user', async () => {
      const presets = [
        { id: 'test-id-1', preset_name: 'Preset 1', user_id: 'testUser' },
        { id: 'test-id-2', preset_name: 'Preset 2', user_id: 'testUser' },
      ];
      goalPresetService.getGoalPresets.mockResolvedValue(presets);
      const res = await request(app)
        .get('/api/v2/goal-presets')
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(presets);
      expect(goalPresetService.getGoalPresets).toHaveBeenCalledWith('testUser');
    });
  });
  describe('GET /api/v2/goal-presets/:id', () => {
    it('should return a specific goal preset', async () => {
      const presetId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID format
      const preset = {
        id: presetId,
        preset_name: 'Test Preset',
        user_id: 'testUser',
        calories: 2000,
      };
      goalPresetService.getGoalPreset.mockResolvedValue(preset);
      const res = await request(app)
        .get(`/api/v2/goal-presets/${presetId}`)
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(preset);
      expect(goalPresetService.getGoalPreset).toHaveBeenCalledWith(
        presetId,
        'testUser'
      );
    });
    it('should return 404 for non-existent preset', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440001'; // Valid UUID format
      goalPresetService.getGoalPreset.mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/v2/goal-presets/${nonExistentId}`)
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(404);
      expect(res.body).toEqual({ error: 'Goal preset not found.' });
    });
    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/v2/goal-presets/invalid-uuid')
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Validation error');
    });
  });
  describe('PUT /api/v2/goal-presets/:id', () => {
    it('should update a goal preset', async () => {
      const presetId = '550e8400-e29b-41d4-a716-446655440002'; // Valid UUID format
      const updatedPreset = {
        id: presetId,
        preset_name: 'Updated Preset',
        user_id: 'testUser',
        calories: 2500,
      };
      goalPresetService.updateGoalPreset.mockResolvedValue(updatedPreset);
      const res = await request(app)
        .put(`/api/v2/goal-presets/${presetId}`)
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Updated Preset',
          calories: 2500,
          protein: 187,
          carbs: 250,
          fat: 83,
          water_goal_ml: 3000,
          saturated_fat: 12,
          polyunsaturated_fat: 6,
          monounsaturated_fat: 9,
          trans_fat: 0,
          cholesterol: 350,
          sodium: 2500,
          potassium: 3800,
          dietary_fiber: 30,
          sugars: 60,
          vitamin_a: 1000,
          vitamin_c: 100,
          calcium: 1500,
          iron: 20,
          target_exercise_calories_burned: 600,
          target_exercise_duration_minutes: 75,
          protein_percentage: 35,
          carbs_percentage: 45,
          fat_percentage: 20,
          breakfast_percentage: 30,
          lunch_percentage: 40,
          dinner_percentage: 25,
          snacks_percentage: 5,
          custom_nutrients: {},
        });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(updatedPreset);
      expect(goalPresetService.updateGoalPreset).toHaveBeenCalledWith(
        presetId,
        'testUser',
        expect.objectContaining({
          preset_name: 'Updated Preset',
          calories: 2500,
        })
      );
    });
    it('should return 409 Conflict for duplicate preset name during update', async () => {
      const presetId = '550e8400-e29b-41d4-a716-446655440006'; // Valid UUID format
      const error = new Error('A goal preset with this name already exists.');
      error.code = '23505'; // Set the PostgreSQL error code
      goalPresetService.updateGoalPreset.mockRejectedValue(error);
      const res = await request(app)
        .put(`/api/v2/goal-presets/${presetId}`)
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Duplicate Preset',
          calories: 2500,
          protein: 187,
          carbs: 250,
          fat: 83,
          water_goal_ml: 3000,
          saturated_fat: 12,
          polyunsaturated_fat: 6,
          monounsaturated_fat: 9,
          trans_fat: 0,
          cholesterol: 350,
          sodium: 2500,
          potassium: 3800,
          dietary_fiber: 30,
          sugars: 60,
          vitamin_a: 1000,
          vitamin_c: 100,
          calcium: 1500,
          iron: 20,
          target_exercise_calories_burned: 600,
          target_exercise_duration_minutes: 75,
          protein_percentage: 35,
          carbs_percentage: 45,
          fat_percentage: 20,
          breakfast_percentage: 30,
          lunch_percentage: 40,
          dinner_percentage: 25,
          snacks_percentage: 5,
          custom_nutrients: {},
        });
      expect(res.statusCode).toEqual(409);
      expect(res.body).toEqual({
        error: 'A goal preset with this name already exists.',
      });
    });
    it('should return 404 for non-existent preset', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440003'; // Valid UUID format
      goalPresetService.updateGoalPreset.mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/v2/goal-presets/${nonExistentId}`)
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Updated Preset',
          calories: 2500,
          protein: 187,
          carbs: 250,
          fat: 83,
          water_goal_ml: 3000,
          protein_percentage: null,
          carbs_percentage: null,
          fat_percentage: null,
          saturated_fat: null,
          polyunsaturated_fat: null,
          monounsaturated_fat: null,
          trans_fat: null,
          cholesterol: null,
          sodium: null,
          potassium: null,
          dietary_fiber: null,
          sugars: null,
          vitamin_a: null,
          vitamin_c: null,
          calcium: null,
          iron: null,
          target_exercise_calories_burned: null,
          target_exercise_duration_minutes: null,
          breakfast_percentage: null,
          lunch_percentage: null,
          dinner_percentage: null,
          snacks_percentage: null,
          custom_nutrients: null,
        });
      expect(res.statusCode).toEqual(404);
      expect(res.body).toEqual({ error: 'Goal preset not found.' });
    });
    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .put('/api/v2/goal-presets/invalid-uuid')
        .set('Cookie', ['userId=testUser'])
        .send({
          preset_name: 'Updated Preset',
          calories: 2500,
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Validation error');
    });
    it('should return 400 for invalid request body', async () => {
      const presetId = '550e8400-e29b-41d4-a716-446655440007'; // Valid UUID format
      const res = await request(app)
        .put(`/api/v2/goal-presets/${presetId}`)
        .set('Cookie', ['userId=testUser'])
        .send({
          // Missing required preset_name
          calories: 2500,
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Invalid request body');
    });
  });
  describe('DELETE /api/v2/goal-presets/:id', () => {
    it('should delete a goal preset', async () => {
      const presetId = '550e8400-e29b-41d4-a716-446655440004'; // Valid UUID format
      goalPresetService.deleteGoalPreset.mockResolvedValue({ success: true });
      const res = await request(app)
        .delete(`/api/v2/goal-presets/${presetId}`)
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(200);
      expect(goalPresetService.deleteGoalPreset).toHaveBeenCalledWith(
        presetId,
        'testUser'
      );
    });
    it('should return 404 for non-existent preset', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440005'; // Valid UUID format
      goalPresetService.deleteGoalPreset.mockResolvedValue(null);
      const res = await request(app)
        .delete(`/api/v2/goal-presets/${nonExistentId}`)
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(404);
      expect(res.body).toEqual({ error: 'Goal preset not found.' });
    });
    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .delete('/api/v2/goal-presets/invalid-uuid')
        .set('Cookie', ['userId=testUser']);
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Validation error');
    });
  });
});
