const express = require('express');
const router = express.Router();
const exercisePresetEntryRepository = require('../models/exercisePresetEntryRepository');
const workoutPresetRepository = require('../models/workoutPresetRepository');
const exerciseEntryRepository = require('../models/exerciseEntry');
const exerciseRepository = require('../models/exercise'); // Import exerciseRepository
const exerciseService = require('../services/exerciseService'); // Import exerciseService
const { log } = require('../config/logging');
const { body, param, validationResult } = require('express-validator');

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

/**
 * @swagger
 * tags:
 *   name: Fitness & Workouts
 *   description: Exercise database, workout presets, and activity logging.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ExercisePresetEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The unique identifier for the exercise preset entry.
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns the entry.
 *         workout_preset_id:
 *           type: integer
 *           description: The ID of the workout preset this entry originated from.
 *         name:
 *           type: string
 *           description: The name of the logged workout.
 *         description:
 *           type: string
 *           description: A description of the logged workout.
 *         entry_date:
 *           type: string
 *           format: date
 *           description: The date the workout was logged (YYYY-MM-DD).
 *         notes:
 *           type: string
 *           description: Additional notes for the logged workout.
 *         source:
 *           type: string
 *           description: The source of the entry (e.g., "manual", "Garmin Connect").
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the entry was created.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the entry was last updated.
 *       required:
 *         - user_id
 *         - workout_preset_id
 *         - name
 *         - entry_date
 */

/**
 * @swagger
 * /exercise-preset-entries:
 *   post:
 *     summary: Add a workout preset to the diary
 *     tags: [Fitness & Workouts]
 *     description: Logs a workout preset as an exercise preset entry and creates individual exercise entries for each exercise within the preset.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workout_preset_id
 *               - entry_date
 *             properties:
 *               workout_preset_id:
 *                 type: integer
 *                 description: The ID of the workout preset to log.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: The date for which the workout is logged (YYYY-MM-DD).
 *               name:
 *                 type: string
 *                 description: Optional name for the logged workout. If not provided, uses preset name.
 *               description:
 *                 type: string
 *                 description: Optional description for the logged workout. If not provided, uses preset description.
 *               notes:
 *                 type: string
 *                 description: Optional notes for the logged workout.
 *               source:
 *                 type: string
 *                 description: The source of the entry (e.g., "manual", "Garmin Connect"). Defaults to "manual".
 *     responses:
 *       201:
 *         description: The exercise preset entry and associated exercise entries were created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               allOf:
 *                 - $ref: '#/components/schemas/ExercisePresetEntry'
 *                 - type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: preset
 *                     exercises:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ExerciseEntry'
 *                     total_duration_minutes:
 *                       type: integer
 *                       example: 45
 *       400:
 *         description: Invalid request body or validation errors.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Workout preset not found.
 *       500:
 *         description: Failed to add workout preset to diary.
 */
router.post(
  '/',
  isAuthenticated,
  [
    body('workout_preset_id').isInt().withMessage('Workout preset ID must be an integer.'),
    body('entry_date').isISO8601().withMessage('Entry date must be a valid ISO 8601 date.'),
    body('name').optional().notEmpty().withMessage('Preset name cannot be empty.'),
    body('description').optional().isString().withMessage('Description must be a string.'),
    body('notes').optional().isString().withMessage('Notes must be a string.'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { workout_preset_id, entry_date, name, description, notes, source } = req.body;
      const userId = req.userId;
      const createdByUserId = req.userId;

      const groupedPresetEntry = await exerciseService.logWorkoutPresetGrouped(userId, createdByUserId, workout_preset_id, entry_date, {
        name,
        description,
        notes,
        source: source !== undefined ? source : 'manual',
      });

      res.status(201).json(groupedPresetEntry);
    } catch (error) {
      if (error.message === 'Workout preset not found.') {
        return res.status(404).json({ message: error.message });
      }
      log('error', `Error adding workout preset to diary:`, error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   get:
 *     summary: Get an exercise preset entry by ID
 *     tags: [Fitness & Workouts]
 *     description: Retrieves a single exercise preset entry by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise preset entry to retrieve.
 *     responses:
 *       200:
 *         description: The requested exercise preset entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExercisePresetEntry'
 *       400:
 *         description: Invalid exercise preset entry ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Exercise preset entry not found.
 *       500:
 *         description: Failed to fetch exercise preset entry.
 */
router.get(
  '/:id',
  isAuthenticated,
  [
    param('id').isUUID().withMessage('Exercise preset entry ID must be a valid UUID.'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const userId = req.userId;
      const entry = await exercisePresetEntryRepository.getExercisePresetEntryById(id, userId);
      if (!entry) {
        return res.status(404).json({ message: 'Exercise preset entry not found.' });
      }
      res.json(entry);
    } catch (error) {
      log('error', `Error getting exercise preset entry by ID ${req.params.id}:`, error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   put:
 *     summary: Update an exercise preset entry
 *     tags: [Fitness & Workouts]
 *     description: Updates an existing exercise preset entry.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise preset entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the logged workout.
 *               description:
 *                 type: string
 *                 description: A new description for the logged workout.
 *               notes:
 *                 type: string
 *                 description: New notes for the logged workout.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: The new date for the logged workout (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: The exercise preset entry was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExercisePresetEntry'
 *       400:
 *         description: Invalid request body or validation errors.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Exercise preset entry not found or not authorized.
 *       500:
 *         description: Failed to update exercise preset entry.
 */
router.put(
  '/:id',
  isAuthenticated,
  [
    param('id').isUUID().withMessage('Exercise preset entry ID must be a valid UUID.'),
    body('name').optional().notEmpty().withMessage('Preset name cannot be empty.'),
    body('description').optional().isString().withMessage('Description must be a string.'),
    body('notes').optional().isString().withMessage('Notes must be a string.'),
    body('entry_date').optional().isISO8601().withMessage('Entry date must be a valid ISO 8601 date.'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const userId = req.userId;
      const updatedEntry = await exercisePresetEntryRepository.updateExercisePresetEntry(id, userId, req.body);
      if (!updatedEntry) {
        return res.status(404).json({ message: 'Exercise preset entry not found or not authorized.' });
      }
      res.json(updatedEntry);
    } catch (error) {
      log('error', `Error updating exercise preset entry ${req.params.id}:`, error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   delete:
 *     summary: Delete an exercise preset entry
 *     tags: [Fitness & Workouts]
 *     description: Deletes a specific exercise preset entry.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the exercise preset entry to delete.
 *     responses:
 *       204:
 *         description: Exercise preset entry deleted successfully.
 *       400:
 *         description: Invalid exercise preset entry ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Exercise preset entry not found or not authorized.
 *       500:
 *         description: Failed to delete exercise preset entry.
 */
router.delete(
  '/:id',
  isAuthenticated,
  [
    param('id').isUUID().withMessage('Exercise preset entry ID must be a valid UUID.'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const userId = req.userId;
      const deleted = await exercisePresetEntryRepository.deleteExercisePresetEntry(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Exercise preset entry not found or not authorized.' });
      }
      res.status(204).send(); // No content
    } catch (error) {
      log('error', `Error deleting exercise preset entry ${req.params.id}:`, error);
      next(error);
    }
  }
);

module.exports = router;
