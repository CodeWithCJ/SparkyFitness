const express = require('express');
const router = express.Router();
const moodRepository = require('../models/moodRepository');
const { authenticate } = require('../middleware/authMiddleware');

// Create a new mood entry
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { mood_value, notes, entry_date } = req.body;
    const userId = req.userId; // Changed from req.user.id

    if (mood_value == null) { //0 is a valid 'mood' value
      return res.status(400).json({ message: 'Mood value is required.' });
    }

    const newMoodEntry = await moodRepository.createOrUpdateMoodEntry(userId, mood_value, notes, entry_date);
    res.status(201).json(newMoodEntry);
  } catch (error) {
    next(error);
  }
});

// Get mood entries for a user within a date range
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const authenticatedUserId = req.userId; // Changed from req.user.id
        // Log req.query
    console.log('moodRoutes: GET /mood - Request Query:', { userId, startDate, endDate });

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ message: 'User ID, start date, and end date are required.' });
    }

    const moodEntries = await moodRepository.getMoodEntriesByUserId(userId, startDate, endDate);
    res.json(moodEntries);
  } catch (error) {
    next(error);
  }
});

// Get a single mood entry by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const authenticatedUserId = req.userId; // Changed from req.user.id

    const moodEntry = await moodRepository.getMoodEntryById(id, authenticatedUserId);

    if (!moodEntry) {
      return res.status(404).json({ message: 'Mood entry not found.' });
    }

    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});

// Get a single mood entry by date
router.get('/date/:entryDate', authenticate, async (req, res, next) => {
  try {
    const { entryDate } = req.params;
    const authenticatedUserId = req.userId;
    const moodEntry = await moodRepository.getMoodEntryByDate(authenticatedUserId, entryDate);

    if (!moodEntry) {
      return res.status(200).json({}); // Return empty object with 200 OK
    }

    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});

// Update a mood entry
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mood_value, notes } = req.body;
    const authenticatedUserId = req.userId; // Changed from req.user.id

    const updatedMoodEntry = await moodRepository.updateMoodEntry(id, authenticatedUserId, mood_value, notes);
    res.json(updatedMoodEntry);
  } catch (error) {
    next(error);
  }
});

// Delete a mood entry
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const authenticatedUserId = req.userId; // Changed from req.user.id

    const deleted = await moodRepository.deleteMoodEntry(id, authenticatedUserId);
    if (deleted) {
      res.status(204).send(); // No content
    } else {
      res.status(404).json({ message: 'Mood entry not found or not authorized to delete.' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;