const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware'); // Import authenticate
const FreeExerciseDBService = require('../integrations/freeexercisedb/FreeExerciseDBService');
const exerciseService = require('../services/exerciseService'); // Import exerciseService

/**
 * @route GET /api/freeexercisedb/search
 * @description Search for exercises from the free-exercise-db.
 * @param {string} query - The search query (optional).
 * @returns {Array<object>} A list of matching exercises.
 */
router.get('/search', async (req, res) => {
    try {
        const query = req.query.query ? req.query.query.toLowerCase() : '';
        const exerciseList = await FreeExerciseDBService.getExerciseList();

        let filteredExercises = exerciseList;
        if (query) {
            filteredExercises = exerciseList.filter(exercise =>
                exercise.name.toLowerCase().includes(query)
            );
        }

        res.json(filteredExercises);
    } catch (error) {
        console.error('[freeExerciseDBRoutes] Error searching free-exercise-db:', error);
        res.status(500).json({ message: 'Error searching free-exercise-db', error: error.message });
    }
});

/**
 * @route POST /api/freeexercisedb/add
 * @description Adds a selected free-exercise-db exercise to the user's local exercises.
 * @param {string} exerciseId - The ID of the free-exercise-db exercise to add.
 * @returns {object} The newly created exercise in the user's database.
 */
router.post('/add', authenticate, async (req, res, next) => {
    try {
        const { exerciseId } = req.body;
        if (!exerciseId) {
            return res.status(400).json({ message: 'Exercise ID is required.' });
        }

        const authenticatedUserId = req.userId;
        const newExercise = await exerciseService.addFreeExerciseDBExerciseToUserExercises(authenticatedUserId, exerciseId);
        res.status(201).json(newExercise);
    } catch (error) {
        console.error('[freeExerciseDBRoutes] Error adding free-exercise-db exercise:', error);
        next(error); // Pass error to centralized error handler
    }
});

module.exports = router;