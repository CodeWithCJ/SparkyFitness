import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import exerciseService from '../services/exerciseService.js';
const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Fitness & Workouts
 *   description: Exercise database, workout presets, and activity logging.
 */
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
    const newExercise =
      await exerciseService.addFreeExerciseDBExerciseToUserExercises(
        authenticatedUserId,
        exerciseId
      );
    res.status(201).json(newExercise);
  } catch (error) {
    console.error(
      '[freeExerciseDBRoutes] Error adding free-exercise-db exercise:',
      error
    );
    next(error); // Pass error to centralized error handler
  }
});
export default router;
