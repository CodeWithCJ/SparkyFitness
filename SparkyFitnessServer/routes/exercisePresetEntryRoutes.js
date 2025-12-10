const express = require('express');
const router = express.Router();
const exercisePresetEntryRepository = require('../models/exercisePresetEntryRepository');
const workoutPresetRepository = require('../models/workoutPresetRepository');
const exerciseEntryRepository = require('../models/exerciseEntry');
const exerciseRepository = require('../models/exercise'); // Import exerciseRepository
const { log } = require('../config/logging');
const { body, param, validationResult } = require('express-validator');

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// POST /api/exercise-preset-entries - Add a workout preset to the diary
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

      // 1. Fetch the workout preset details
      const workoutPreset = await workoutPresetRepository.getWorkoutPresetById(workout_preset_id, userId);
      if (!workoutPreset) {
        return res.status(404).json({ message: 'Workout preset not found.' });
      }

      // 2. Create the exercise_preset_entry
      const newExercisePresetEntry = await exercisePresetEntryRepository.createExercisePresetEntry(
        userId,
        {
          workout_preset_id: workout_preset_id,
          name: name || workoutPreset.name, // Use provided name or preset name
          description: description || workoutPreset.description, // Use provided description or preset description
          entry_date: entry_date,
          notes: notes,
          source: source !== undefined ? source : 'manual',
        },
        createdByUserId
      );

      const createdExerciseEntries = []; // Array to store created exercise entries

      // 3. Create individual exercise_entries for each exercise in the preset
      if (workoutPreset.exercises && workoutPreset.exercises.length > 0) {
        for (const exercise of workoutPreset.exercises) {
          // Fetch full exercise details to get calories_per_hour
          const fullExercise = await exerciseRepository.getExerciseById(exercise.exercise_id, userId);
          if (!fullExercise) {
            log('warn', `Exercise with ID ${exercise.exercise_id} not found for preset. Skipping.`);
            continue; // Skip this exercise if not found
          }

          // Determine duration_minutes, default to 30 if not specified in preset
          const durationMinutes = exercise.duration_minutes || 30;
          // Calculate calories burned
          const caloriesBurned = Math.round((fullExercise.calories_per_hour / 60) * durationMinutes);

          const exerciseEntryData = {
            exercise_id: exercise.exercise_id,
            entry_date: entry_date,
            notes: exercise.notes, // Use notes from preset exercise if available
            sets: exercise.sets, // Copy sets from preset exercise
            duration_minutes: durationMinutes,
            calories_burned: caloriesBurned,
            avg_heart_rate: null, // Set to null as it's not available from preset definition
            // max_heart_rate is not directly stored in ExerciseEntry, it's derived on frontend
          };
          const newEntry = await exerciseEntryRepository.createExerciseEntry(
            userId,
            exerciseEntryData,
            createdByUserId,
            'Workout Preset', // entrySource
            newExercisePresetEntry.id // Link to the newly created exercise_preset_entry
          );
          createdExerciseEntries.push(newEntry); // Add the created entry to the array
        }
      }

      res.status(201).json(createdExerciseEntries); // Return the array of created exercise entries
    } catch (error) {
      log('error', `Error adding workout preset to diary:`, error);
      next(error);
    }
  }
);

// GET /api/exercise-preset-entries/:id - Get an exercise preset entry by ID
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

// PUT /api/exercise-preset-entries/:id - Update an exercise preset entry
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

// DELETE /api/exercise-preset-entries/:id - Delete an exercise preset entry
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