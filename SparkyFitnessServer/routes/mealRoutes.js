const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const mealService = require('../services/mealService');
const { log } = require('../config/logging');

router.use(express.json());

// --- Meal Plan Routes ---

// Create a new meal plan entry
router.post('/plan', authenticate, async (req, res, next) => {
  try {
    const newMealPlanEntry = await mealService.createMealPlanEntry(req.userId, req.body);
    res.status(201).json(newMealPlanEntry);
  } catch (error) {
    log('error', `Error creating meal plan entry:`, error);
    next(error);
  }
});

// Get meal plan entries for a specific date or date range
router.get('/plan', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required for meal plan retrieval.' });
    }
    const mealPlanEntries = await mealService.getMealPlanEntries(req.userId, startDate, endDate);
    res.status(200).json(mealPlanEntries);
  } catch (error) {
    log('error', `Error getting meal plan entries:`, error);
    next(error);
  }
});

// Update a meal plan entry
router.put('/plan/:id', authenticate, async (req, res, next) => {
  try {
    const updatedMealPlanEntry = await mealService.updateMealPlanEntry(req.userId, req.params.id, req.body);
    res.status(200).json(updatedMealPlanEntry);
  } catch (error) {
    log('error', `Error updating meal plan entry ${req.params.id}:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Delete a meal plan entry
router.delete('/plan/:id', authenticate, async (req, res, next) => {
  try {
    await mealService.deleteMealPlanEntry(req.userId, req.params.id);
    res.status(200).json({ message: 'Meal plan entry deleted successfully.' });
  } catch (error) {
    log('error', `Error deleting meal plan entry ${req.params.id}:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// --- Meal Template Routes ---

// Create a new meal template
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newMeal = await mealService.createMeal(req.userId, req.body);
    res.status(201).json(newMeal);
  } catch (error) {
    log('error', `Error creating meal:`, error);
    next(error);
  }
});

// Get all meal templates for the user (and public ones)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { filter, search } = req.query;
    const meals = await mealService.getMeals(req.userId, filter, search);
    res.status(200).json(meals);
  } catch (error) {
    log('error', `Error getting meals:`, error);
    next(error);
  }
});

// Search for meal templates
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { searchTerm } = req.query;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required.' });
    }
    const meals = await mealService.searchMeals(req.userId, searchTerm);
    res.status(200).json(meals);
  } catch (error) {
    log('error', `Error searching meals:`, error);
    next(error);
  }
});

// Get a specific meal template by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const meal = await mealService.getMealById(req.userId, req.params.id);
    res.status(200).json(meal);
  } catch (error) {
    log('error', `Error getting meal by ID ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Update an existing meal template
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { confirmationMessage, ...updatedMeal } = await mealService.updateMeal(req.userId, req.params.id, req.body);
    res.status(200).json({ ...updatedMeal, confirmationMessage });
  } catch (error) {
    log('error', `Error updating meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Delete a meal template
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await mealService.deleteMeal(req.userId, req.params.id);
    res.status(200).json({ message: 'Meal deleted successfully.' });
  } catch (error) {
    log('error', `Error deleting meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Get the deletion impact for a meal
router.get('/:id/deletion-impact', authenticate, async (req, res, next) => {
  try {
    const deletionImpact = await mealService.getMealDeletionImpact(req.userId, req.params.id);
    res.status(200).json(deletionImpact);
  } catch (error) {
    log('error', `Error getting meal deletion impact for meal ${req.params.id}:`, error);
    if (error.message === 'Meal not found.') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// --- Logging Meal Plan to Food Entries ---

// Log a specific meal plan entry to the food diary
router.post('/plan/:id/log-to-diary', authenticate, async (req, res, next) => {
  try {
    const { target_date } = req.body;
    const createdFoodEntries = await mealService.logMealPlanEntryToDiary(req.userId, req.params.id, target_date);
    res.status(201).json(createdFoodEntries);
  } catch (error) {
    log('error', `Error logging meal plan entry ${req.params.id} to diary:`, error);
    if (error.message === 'Meal plan entry not found or not authorized.' || error.message === 'Associated meal template not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Log all meal plan entries for a specific day to the food diary
router.post('/plan/log-day-to-diary', authenticate, async (req, res, next) => {
  try {
    const { plan_date, target_date } = req.body;
    if (!plan_date) {
      return res.status(400).json({ error: 'plan_date is required.' });
    }
    const createdFoodEntries = await mealService.logDayMealPlanToDiary(req.userId, plan_date, target_date);
    res.status(201).json(createdFoodEntries);
  } catch (error) {
    log('error', `Error logging day meal plan to diary for date ${req.body.plan_date}:`, error);
    next(error);
  }
});

router.get(
  "/needs-review",
  authenticate,
  async (req, res, next) => {
    try {
      const mealsNeedingReview = await mealService.getMealsNeedingReview(req.userId);
      res.status(200).json(mealsNeedingReview);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/update-snapshot",
  authenticate,
  async (req, res, next) => {
    const { mealId } = req.body;
    if (!mealId) {
      return res.status(400).json({ error: "mealId is required." });
    }
    try {
      const result = await mealService.updateMealEntriesSnapshot(req.userId, mealId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Create a meal from diary entries
router.post('/create-meal-from-diary', authenticate, async (req, res, next) => {
  try {
    const { date, mealType, mealName, description, isPublic } = req.body;
    if (!date || !mealType) {
      return res.status(400).json({ error: 'Date and mealType are required to create a meal from diary entries.' });
    }
    const newMeal = await mealService.createMealFromDiaryEntries(req.userId, date, mealType, mealName, description, isPublic);
    res.status(201).json(newMeal);
  } catch (error) {
    log('error', `Error creating meal from diary entries:`, error);
    if (error.message.startsWith('No food entries found') || error.message.startsWith('Cannot create meal')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;