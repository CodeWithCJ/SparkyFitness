const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const workoutPresetService = require('../services/workoutPresetService');

// Create a new workout preset
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPreset = await workoutPresetService.createWorkoutPreset(req.userId, req.body);
    res.status(201).json(newPreset);
  } catch (error) {
    next(error);
  }
});

// Get all workout presets for the authenticated user
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

// Get a specific workout preset by ID
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

// Update an existing workout preset
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

// Delete a workout preset
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

// Search workout presets
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