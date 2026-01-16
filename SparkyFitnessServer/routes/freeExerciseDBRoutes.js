const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware'); // Import authenticate
const FreeExerciseDBService = require('../integrations/freeexercisedb/FreeExerciseDBService');
const exerciseService = require('../services/exerciseService'); // Import exerciseService

/**
 * @swagger
 * tags:
 *   name: Fitness & Workouts
 *   description: Exercise database, workout presets, and activity logging.
 */

/**
 * @swagger
 * /freeexercisedb/search:
 *   get:
 *     summary: Search for exercises from the free-exercise-db
 *     tags: [Fitness & Workouts]
 *     description: Searches for exercises from an external free exercise database based on a query.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: The search query (optional).
 *     responses:
 *       200:
 *         description: A list of matching exercises.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The ID of the exercise in the free database.
 *                   name:
 *                     type: string
 *                     description: The name of the exercise.
 *                   category:
 *                     type: string
 *                     description: The category of the exercise.
 *                   equipment:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Equipment needed for the exercise.
 *                   muscle_groups:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Muscle groups targeted.
 *       500:
 *         description: Error searching free-exercise-db.
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
 * @swagger
 * /freeexercisedb/add:
 *   post:
 *     summary: Add a free-exercise-db exercise to user's local exercises
 *     tags: [Fitness & Workouts]
 *     description: Adds a selected exercise from the free exercise database to the authenticated user's personal exercise list.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exerciseId
 *             properties:
 *               exerciseId:
 *                 type: string
 *                 description: The ID of the free-exercise-db exercise to add.
 *     responses:
 *       201:
 *         description: The newly created exercise in the user's database.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exercise'
 *       400:
 *         description: Exercise ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Error adding free-exercise-db exercise.
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
