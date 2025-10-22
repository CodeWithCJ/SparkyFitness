const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const preferenceService = require('../services/preferenceService');

// Endpoint to update user preferences
router.put('/', authenticate, async (req, res, next) => {
  const preferenceData = req.body;
 
  try {
    const updatedPreferences = await preferenceService.updateUserPreferences(req.userId, req.userId, preferenceData);
    res.status(200).json(updatedPreferences);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User preferences not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to delete user preferences
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const result = await preferenceService.deleteUserPreferences(req.userId, req.userId);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User preferences not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch user preferences
router.get('/', authenticate, async (req, res, next) => {
  try {
    const preferences = await preferenceService.getUserPreferences(req.userId, req.userId);
    res.status(200).json(preferences);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User preferences not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to upsert user preferences
router.post('/', authenticate, async (req, res, next) => {
  const preferenceData = req.body;

  try {
    const newPreferences = await preferenceService.upsertUserPreferences(req.userId, preferenceData);
    res.status(200).json(newPreferences);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;