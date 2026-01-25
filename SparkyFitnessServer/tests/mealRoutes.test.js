const request = require('supertest');
const express = require('express');
const mealRoutes = require('../routes/mealRoutes');
const mealService = require('../services/mealService');
const { authenticateToken, authorizeAccess } = require('../middleware/authMiddleware');
const errorHandler = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

// Mock middleware and service
jest.mock('../services/mealService');
jest.mock('../middleware/authMiddleware', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
  authenticateToken: jest.fn((req, res, next) => {
    req.userId = 'testUserId';
    next();
  }),
  authorizeAccess: jest.fn((permission, getTargetUserId) => (req, res, next) => {
    next();
  }),
}));

const app = express();
app.use(express.json());
app.use('/meals', mealRoutes);
app.use(errorHandler);

describe('Meal Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Meal Template Routes ---

  describe('POST /meals', () => {
    it('should create a new meal template', async () => {
      const newMeal = { id: uuidv4(), name: 'New Meal', user_id: 'testUserId' };
      mealService.createMeal.mockResolvedValue(newMeal);

      const res = await request(app)
        .post('/meals')
        .send({ name: 'New Meal', foods: [] });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(newMeal);
      expect(mealService.createMeal).toHaveBeenCalledWith('testUserId', { name: 'New Meal', foods: [] });
    });

    it('should return 500 if meal creation fails', async () => {
      mealService.createMeal.mockRejectedValue(new Error('Failed to create meal'));

      const res = await request(app)
        .post('/meals')
        .send({ name: 'New Meal', foods: [] });

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /meals', () => {
    it('should return all meals for the user', async () => {
      const meals = [{ id: uuidv4(), name: 'Meal 1' }];
      mealService.getMeals.mockResolvedValue(meals);

      const res = await request(app).get('/meals');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(meals);
      expect(mealService.getMeals).toHaveBeenCalledWith('testUserId', undefined, undefined);
    });

    it('should return public meals when filter is public', async () => {
      const meals = [{ id: uuidv4(), name: 'Public Meal', is_public: true }];
      mealService.getMeals.mockResolvedValue(meals);

      const res = await request(app).get('/meals?filter=public');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(meals);
      expect(mealService.getMeals).toHaveBeenCalledWith('testUserId', 'public', undefined);
    });
  });

  describe('GET /meals/:id', () => {
    it('should return a specific meal by ID', async () => {
      const mealId = uuidv4();
      const meal = { id: mealId, name: 'Specific Meal' };
      mealService.getMealById.mockResolvedValue(meal);

      const res = await request(app).get(`/meals/${mealId}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(meal);
      expect(mealService.getMealById).toHaveBeenCalledWith('testUserId', mealId);
    });

    it('should return 404 if meal not found', async () => {
      mealService.getMealById.mockRejectedValue(new Error('Meal not found.'));

      const res = await request(app).get(`/meals/${uuidv4()}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal not found.');
    });

    it('should return 403 if not authorized to access meal', async () => {
      mealService.getMealById.mockRejectedValue(new Error('Forbidden: You do not have permission to access this meal.'));

      const res = await request(app).get(`/meals/${uuidv4()}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: You do not have permission to access this meal.');
    });
  });

  describe('PUT /meals/:id', () => {
    it('should update an existing meal template', async () => {
      const mealId = uuidv4();
      const updatedMeal = { id: mealId, name: 'Updated Meal' };
      mealService.updateMeal.mockResolvedValue(updatedMeal);

      const res = await request(app)
        .put(`/meals/${mealId}`)
        .send({ name: 'Updated Meal', foods: [] });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(updatedMeal);
      expect(mealService.updateMeal).toHaveBeenCalledWith('testUserId', mealId, { name: 'Updated Meal', foods: [] });
    });

    it('should return 404 if meal not found during update', async () => {
      mealService.updateMeal.mockRejectedValue(new Error('Meal not found.'));

      const res = await request(app)
        .put(`/meals/${uuidv4()}`)
        .send({ name: 'Updated Meal' });

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal not found.');
    });
  });

  describe('DELETE /meals/:id', () => {
    it('should delete a meal template', async () => {
      mealService.deleteMeal.mockResolvedValue(true);

      const res = await request(app).delete(`/meals/${uuidv4()}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Meal deleted successfully.');
      expect(mealService.deleteMeal).toHaveBeenCalledWith('testUserId', expect.any(String));
    });

    it('should return 404 if meal not found during delete', async () => {
      mealService.deleteMeal.mockRejectedValue(new Error('Meal not found.'));

      const res = await request(app).delete(`/meals/${uuidv4()}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal not found.');
    });
  });

  // --- Meal Plan Routes ---

  describe('POST /meals/plan', () => {
    it('should create a new meal plan entry', async () => {
      const newPlanEntry = { id: uuidv4(), meal_type: 'breakfast' };
      mealService.createMealPlanEntry.mockResolvedValue(newPlanEntry);

      const res = await request(app)
        .post('/meals/plan')
        .send({ meal_type: 'breakfast', plan_date: '2024-07-15' });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(newPlanEntry);
      expect(mealService.createMealPlanEntry).toHaveBeenCalledWith('testUserId', { meal_type: 'breakfast', plan_date: '2024-07-15' });
    });
  });

  describe('GET /meals/plan', () => {
    it('should return meal plan entries for a date range', async () => {
      const planEntries = [{ id: uuidv4(), meal_type: 'lunch' }];
      mealService.getMealPlanEntries.mockResolvedValue(planEntries);

      const res = await request(app).get('/meals/plan?startDate=2024-07-01&endDate=2024-07-31');

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(planEntries);
      expect(mealService.getMealPlanEntries).toHaveBeenCalledWith('testUserId', '2024-07-01', '2024-07-31');
    });

    it('should return 400 if startDate or endDate are missing', async () => {
      const res = await request(app).get('/meals/plan?startDate=2024-07-01');
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'startDate and endDate are required for meal plan retrieval.');
    });
  });

  describe('PUT /meals/plan/:id', () => {
    it('should update a meal plan entry', async () => {
      const planId = uuidv4();
      const updatedPlanEntry = { id: planId, meal_type: 'dinner' };
      mealService.updateMealPlanEntry.mockResolvedValue(updatedPlanEntry);

      const res = await request(app)
        .put(`/meals/plan/${planId}`)
        .send({ meal_type: 'dinner' });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(updatedPlanEntry);
      expect(mealService.updateMealPlanEntry).toHaveBeenCalledWith('testUserId', planId, { meal_type: 'dinner' });
    });

    it('should return 404 if meal plan entry not found during update', async () => {
      mealService.updateMealPlanEntry.mockRejectedValue(new Error('Meal plan entry not found or not authorized.'));

      const res = await request(app)
        .put(`/meals/plan/${uuidv4()}`)
        .send({ meal_type: 'dinner' });

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal plan entry not found or not authorized.');
    });
  });

  describe('DELETE /meals/plan/:id', () => {
    it('should delete a meal plan entry', async () => {
      mealService.deleteMealPlanEntry.mockResolvedValue(true);

      const res = await request(app).delete(`/meals/plan/${uuidv4()}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Meal plan entry deleted successfully.');
      expect(mealService.deleteMealPlanEntry).toHaveBeenCalledWith('testUserId', expect.any(String));
    });

    it('should return 404 if meal plan entry not found during delete', async () => {
      mealService.deleteMealPlanEntry.mockRejectedValue(new Error('Meal plan entry not found or not authorized.'));

      const res = await request(app).delete(`/meals/plan/${uuidv4()}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal plan entry not found or not authorized.');
    });
  });

  // --- Logging Meal Plan to Food Entries ---

  describe('POST /meals/plan/:id/log-to-diary', () => {
    it('should log a specific meal plan entry to the food diary', async () => {
      const mealPlanId = uuidv4();
      const createdFoodEntries = [{ id: uuidv4(), food_id: uuidv4() }];
      mealService.logMealPlanEntryToDiary.mockResolvedValue(createdFoodEntries);

      const res = await request(app)
        .post(`/meals/plan/${mealPlanId}/log-to-diary`)
        .send({ target_date: '2024-07-16' });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(createdFoodEntries);
      expect(mealService.logMealPlanEntryToDiary).toHaveBeenCalledWith('testUserId', mealPlanId, '2024-07-16');
    });

    it('should return 404 if meal plan entry not found during logging', async () => {
      mealService.logMealPlanEntryToDiary.mockRejectedValue(new Error('Meal plan entry not found or not authorized.'));

      const res = await request(app)
        .post(`/meals/plan/${uuidv4()}/log-to-diary`)
        .send({ target_date: '2024-07-16' });

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Meal plan entry not found or not authorized.');
    });
  });

  describe('POST /meals/plan/log-day-to-diary', () => {
    it('should log all meal plan entries for a specific day to the food diary', async () => {
      const createdFoodEntries = [{ id: uuidv4(), food_id: uuidv4() }];
      mealService.logDayMealPlanToDiary.mockResolvedValue(createdFoodEntries);

      const res = await request(app)
        .post('/meals/plan/log-day-to-diary')
        .send({ plan_date: '2024-07-15', target_date: '2024-07-15' });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(createdFoodEntries);
      expect(mealService.logDayMealPlanToDiary).toHaveBeenCalledWith('testUserId', '2024-07-15', '2024-07-15');
    });

    it('should return 400 if plan_date is missing', async () => {
      const res = await request(app)
        .post('/meals/plan/log-day-to-diary')
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'plan_date is required.');
    });
  });
});