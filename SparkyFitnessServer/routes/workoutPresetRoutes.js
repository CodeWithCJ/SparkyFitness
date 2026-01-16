const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const workoutPresetService = require('../services/workoutPresetService');

/**
 * @swagger
 * /workout-presets:
 *   post:
 *     summary: Create a new workout preset
 *     tags: [Fitness & Workouts]
 *     description: Creates a new workout preset for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WorkoutPreset'
 *     responses:
 *       201:
 *         description: The workout preset was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPreset'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPreset = await workoutPresetService.createWorkoutPreset(req.userId, req.body);
    res.status(201).json(newPreset);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /workout-presets:
 *   get:
 *     summary: Get all workout presets
 *     tags: [Fitness & Workouts]
 *     description: Retrieves all workout presets available to the authenticated user (including public ones).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of presets per page.
 *     responses:
 *       200:
 *         description: A paginated list of workout presets.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 presets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WorkoutPreset'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const presets = await workoutPresetService.getWorkoutPresets(req.userId, page, limit);
    res.status(200).json(presets);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /workout-presets/{id}:
 *   get:
 *     summary: Get a specific workout preset by ID
 *     tags: [Fitness & Workouts]
 *     description: Retrieves a specific workout preset by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout preset to retrieve.
 *     responses:
 *       200:
 *         description: The requested workout preset.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPreset'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout preset not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const preset = await workoutPresetService.getWorkoutPresetById(req.userId, req.params.id);
    res.status(200).json(preset);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout preset not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /workout-presets/{id}:
 *   put:
 *     summary: Update an existing workout preset
 *     tags: [Fitness & Workouts]
 *     description: Updates an existing workout preset.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout preset to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WorkoutPreset'
 *     responses:
 *       200:
 *         description: The workout preset was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPreset'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout preset not found or could not be updated.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const updatedPreset = await workoutPresetService.updateWorkoutPreset(req.userId, req.params.id, req.body);
    res.status(200).json(updatedPreset);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout preset not found or could not be updated.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /workout-presets/{id}:
 *   delete:
 *     summary: Delete a workout preset
 *     tags: [Fitness & Workouts]
 *     description: Deletes a specific workout preset.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout preset to delete.
 *     responses:
 *       200:
 *         description: Workout preset deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout preset not found or could not be deleted.
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await workoutPresetService.deleteWorkoutPreset(req.userId, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout preset not found or could not be deleted.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /workout-presets/search:
 *   get:
 *     summary: Search for workout presets
 *     tags: [Fitness & Workouts]
 *     description: Searches for workout presets based on a name search term.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         required: true
 *         schema:
 *           type: string
 *         description: The name or part of the name to search for.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of results to return.
 *     responses:
 *       200:
 *         description: A list of workout presets matching the search term.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkoutPreset'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { searchTerm } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const presets = await workoutPresetService.searchWorkoutPresets(searchTerm, req.userId, limit);
    res.status(200).json(presets);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
