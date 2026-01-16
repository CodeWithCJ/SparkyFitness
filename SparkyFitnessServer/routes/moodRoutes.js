const express = require('express');
const router = express.Router();
const moodRepository = require('../models/moodRepository');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /mood:
 *   post:
 *     summary: Create or update a mood entry
 *     tags: [Wellness & Metrics]
 *     description: Creates a new mood entry or updates an existing one for the authenticated user and specified date.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood_value:
 *                 type: integer
 *                 description: The mood value (e.g., 1-5).
 *               notes:
 *                 type: string
 *                 description: Optional notes about the mood.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: The date of the entry (YYYY-MM-DD).
 *             required: [mood_value, entry_date]
 *     responses:
 *       201:
 *         description: Mood entry created or updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MoodEntry'
 *       400:
 *         description: Mood value is required.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { mood_value, notes, entry_date } = req.body;
    const userId = req.userId;

    if (mood_value == null) {
      return res.status(400).json({ message: 'Mood value is required.' });
    }

    const newMoodEntry = await moodRepository.createOrUpdateMoodEntry(userId, mood_value, notes, entry_date);
    res.status(201).json(newMoodEntry);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood:
 *   get:
 *     summary: Get mood entries within a date range
 *     tags: [Wellness & Metrics]
 *     description: Retrieves mood entries for a specific user and date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to fetch entries for.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of mood entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MoodEntry'
 *       400:
 *         description: Missing required query parameters.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;
    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ message: 'User ID, start date, and end date are required.' });
    }

    const moodEntries = await moodRepository.getMoodEntriesByUserId(userId, startDate, endDate);
    res.json(moodEntries);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood/{id}:
 *   get:
 *     summary: Get a mood entry by ID
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The mood entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MoodEntry'
 *       404:
 *         description: Mood entry not found.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const moodEntry = await moodRepository.getMoodEntryById(id, req.userId);
    if (!moodEntry) {
      return res.status(404).json({ message: 'Mood entry not found.' });
    }
    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood/date/{entryDate}:
 *   get:
 *     summary: Get a mood entry by date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: entryDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: The mood entry for the date (or empty object if not found).
 */
router.get('/date/:entryDate', authenticate, async (req, res, next) => {
  try {
    const { entryDate } = req.params;
    const moodEntry = await moodRepository.getMoodEntryByDate(req.userId, entryDate);
    if (!moodEntry) {
      return res.status(200).json({});
    }
    res.json(moodEntry);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood/{id}:
 *   put:
 *     summary: Update a mood entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood_value:
 *                 type: integer
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated mood entry.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mood_value, notes } = req.body;
    const updatedMoodEntry = await moodRepository.updateMoodEntry(id, req.userId, mood_value, notes);
    res.json(updatedMoodEntry);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mood/{id}:
 *   delete:
 *     summary: Delete a mood entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted successfully.
 *       404:
 *         description: Not found.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await moodRepository.deleteMoodEntry(id, req.userId);
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ message: 'Mood entry not found or not authorized to delete.' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
