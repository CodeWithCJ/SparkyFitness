const express = require('express');
const router = express.Router();
const foodEntryService = require('../services/foodEntryService');
const { authenticate } = require('../middleware/authMiddleware'); // Import authenticate function
const { log } = require('../config/logging');

// Middleware to protect routes
router.use(authenticate); // Use the authenticate middleware function

// POST /food-entry-meals - Create a new FoodEntryMeal
router.post('/', async (req, res, next) => {
    try {
        const { meal_template_id, meal_type, entry_date, name, description, foods, quantity, unit } = req.body;
        const userId = req.userId; // From authMiddleware

        const newFoodEntryMeal = await foodEntryService.createFoodEntryMeal(
            userId, // authenticatedUserId
            userId, // actingUserId (assuming the authenticated user is the acting user for updates)
            { meal_template_id, meal_type, entry_date, name, description, foods, quantity, unit } // mealData
        );
        log('info', `User ${userId} created FoodEntryMeal ${newFoodEntryMeal.id}`);
        res.status(201).json(newFoodEntryMeal);
    } catch (err) {
        log('error', `Error creating FoodEntryMeal: ${err.message}`, err);
        next(err);
    }
});

// GET /food-entry-meals/by-date/:date - Get FoodEntryMeals by date
router.get('/by-date/:date', async (req, res, next) => {
    try {
        const { date } = req.params;
        const userId = req.userId; // From authMiddleware
        const foodEntryMeals = await foodEntryService.getFoodEntryMealsByDate(userId, userId, date); // Corrected arguments
        res.status(200).json(foodEntryMeals);
    } catch (err) {
        log('error', `Error getting FoodEntryMeals by date: ${err.message}`, err);
        next(err);
    }
});

// GET /food-entry-meals/:id - Get a specific FoodEntryMeal with its components
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From authMiddleware
        const foodEntryMeal = await foodEntryService.getFoodEntryMealWithComponents(userId, id);
        if (foodEntryMeal) {
            res.status(200).json(foodEntryMeal);
        } else {
            log('warn', `FoodEntryMeal with ID ${id} not found for user ${userId}`);
            res.status(404).json({ message: 'FoodEntryMeal not found' });
        }
    } catch (err) {
        log('error', `Error getting FoodEntryMeal by ID: ${err.message}`, err);
        next(err);
    }
});

// PUT /food-entry-meals/:id - Update an existing FoodEntryMeal
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, meal_type, entry_date, foods, quantity, unit } = req.body;
        log('info', `[DEBUG] PUT /food-entry-meals/${id} Body:`, { quantity, unit, name }); // DEBUG LOG
        const userId = req.userId; // From authMiddleware

        const updatedFoodEntryMeal = await foodEntryService.updateFoodEntryMeal(
            userId, // authenticatedUserId
            userId, // actingUserId (assuming authenticated user is the acting user for updates)
            id,     // foodEntryMealId
            { name, description, meal_type, entry_date, foods, quantity, unit } // updatedMealData
        );
        log('info', `User ${userId} updated FoodEntryMeal ${id}`);
        res.status(200).json(updatedFoodEntryMeal);
    } catch (err) {
        log('error', `Error updating FoodEntryMeal ${id}: ${err.message}`, err);
        next(err);
    }
});

// DELETE /food-entry-meals/:id - Delete a FoodEntryMeal
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From authMiddleware
        await foodEntryService.deleteFoodEntryMeal(userId, id);
        log('info', `User ${userId} deleted FoodEntryMeal ${id}`);
        res.status(204).send(); // No content
    } catch (err) {
        log('error', `Error deleting FoodEntryMeal ${id}: ${err.message}`, err);
        next(err);
    }
});

module.exports = router;