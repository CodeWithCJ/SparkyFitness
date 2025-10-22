const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const goalPresetService = require('../services/goalPresetService');

// Create a new goal preset
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPreset = await goalPresetService.createGoalPreset(req.userId, req.body);
    res.status(201).json(newPreset);
  } catch (error) {
    next(error);
  }
});

// Get all goal presets for a user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const presets = await goalPresetService.getGoalPresets(req.userId);
    res.status(200).json(presets);
  } catch (error) {
    next(error);
  }
});

// Get a specific goal preset by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const preset = await goalPresetService.getGoalPreset(req.params.id, req.userId);
    if (!preset) {
      return res.status(404).json({ message: 'Goal preset not found.' });
    }
    res.status(200).json(preset);
  } catch (error) {
    next(error);
  }
});

// Update a goal preset
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const updatedPreset = await goalPresetService.updateGoalPreset(req.params.id, req.userId, req.body);
    if (!updatedPreset) {
      return res.status(404).json({ message: 'Goal preset not found or not authorized.' });
    }
    res.status(200).json(updatedPreset);
  } catch (error) {
    next(error);
  }
});

// Delete a goal preset
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deletedPreset = await goalPresetService.deleteGoalPreset(req.params.id, req.userId);
    if (!deletedPreset) {
      return res.status(404).json({ message: 'Goal preset not found or not authorized.' });
    }
    res.status(204).send(); // No content for successful deletion
  } catch (error) {
    next(error);
  }
});

module.exports = router;