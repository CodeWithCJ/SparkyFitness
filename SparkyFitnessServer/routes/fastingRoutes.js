const express = require('express');
const router = express.Router();
const fastingRepository = require('../models/fastingRepository');
const moodRepository = require('../models/moodRepository');
const { log } = require('../config/logging');
const { authenticate } = require('../middleware/authMiddleware');
// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Wellness & Metrics
 *   description: Health metrics, weight tracking, measurements, sleep, mood, and fasting.
 */

// Get current active fast
/**
 * @swagger
 * /fasting/current:
 *   get:
 *     summary: Get current active fast
 *     tags: [Wellness & Metrics]
 *     description: Retrieves the currently active fast for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The active fast or null if none.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */

router.get('/current', async (req, res) => {
    const userId = req.userId;
    log('debug', `GET /current: Fetching fast for userId: ${userId}`);
    try {
        const currentFast = await fastingRepository.getCurrentFast(userId);
        res.json(currentFast || null);
    } catch (error) {
        log('error', `Error fetching current fast: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to fetch current fast' });
    }
});

// Start a new fast
/**
 * @swagger
 * /fasting/start:
 *   post:
 *     summary: Start a new fast
 *     tags: [Wellness & Metrics]
 *     description: Starts a new fasting period for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - start_time
 *               - fasting_type
 *             properties:
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: The start time of the fast.
 *               target_end_time:
 *                 type: string
 *                 format: date-time
 *                 description: The target end time of the fast.
 *               fasting_type:
 *                 type: string
 *                 description: The type of fast (e.g., "Intermittent Fasting").
 *     responses:
 *       201:
 *         description: Success starting fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       400:
 *         description: Validation error or active fast already exists.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */

router.post('/start', async (req, res) => {
    const userId = req.userId;
    const { start_time, target_end_time, fasting_type } = req.body;
    try {
        // Validation
        if (!start_time || !fasting_type) {
            return res.status(400).json({ error: 'Start time and fasting type are required' });
        }

        // Check if there is already an active fast
        const activeFast = await fastingRepository.getCurrentFast(userId);
        if (activeFast) {
            return res.status(400).json({ error: 'There is already an active fast' });
        }

        const newFast = await fastingRepository.createFastingLog(userId, start_time, target_end_time, fasting_type);
        res.status(201).json(newFast);
    } catch (error) {
        log('error', `Error starting fast: ${error.message}`);
        res.status(500).json({ error: 'Failed to start fast' });
    }
});
/**
 * @swagger
 * /fasting/end:
 *   post:
 *     summary: End an active fast
 *     tags: [Wellness & Metrics]
 *     description: Ends an active fasting period, calculates duration, and optionally logs mood.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - end_time
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the fast to end.
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Optional start time to override.
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: The end time of the fast.
 *               mood:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: integer
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Success ending fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Fast not found.
 *       500:
 *         description: Internal server error.
 */
// End an active fast

router.post('/end', async (req, res) => {
    const userId = req.userId;
    const { id, start_time, end_time, weight, mood } = req.body; // mood: { value, notes }

    if (!id || !end_time) {
        return res.status(400).json({ error: 'Fast ID and end time are required' });
    }

    try {
        // 1. Fetch the fast by id to validate ownership and get existing start_time if not provided
        const fast = await fastingRepository.getFastingById(id, userId);
        if (!fast) return res.status(404).json({ error: 'Fast not found' });

        // Determine which start time to use: provided one (frontend) or stored one
        const startUsed = start_time || fast.start_time;

        // Validate chronological order
        if (new Date(startUsed) > new Date(end_time)) {
            return res.status(400).json({ error: 'start_time must be before end_time' });
        }

        if (mood && mood.value != null) {
            // Create mood entry, but we will not store mood_entry_id on fasting_logs (separate table only)
            await moodRepository.createOrUpdateMoodEntry(
                userId,
                mood.value,
                mood.notes || '',
                end_time
            );
        }

        // Calculate duration based on chosen start
        const durationMinutes = Math.round((new Date(end_time) - new Date(startUsed)) / 60000);

        // Persist end (and optional start) and other fields; do not store mood/weight on fasting_logs
        const updatedFast = await fastingRepository.endFast(
            id,
            userId,
            end_time,
            durationMinutes,
            startUsed
        );

        res.json(updatedFast);
    } catch (error) {
        log('error', `Error ending fast: ${error.message}`);
        res.status(500).json({ error: 'Failed to end fast' });
    }
});

// Update a fast (edit start/end times, etc)
/**
 * @swagger
 * /fasting/{id}:
 *   put:
 *     summary: Update an existing fast
 *     tags: [Wellness & Metrics]
 *     description: Updates the details of an existing fasting log.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the fast to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FastingLog'
 *     responses:
 *       200:
 *         description: Success updating fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Fast not found.
 *       500:
 *         description: Internal server error.
 */

router.put('/:id', async (req, res) => {
    const userId = req.userId;
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedFast = await fastingRepository.updateFast(id, userId, updates);
        if (!updatedFast) {
            return res.status(404).json({ error: 'Fast not found' });
        }
        res.json(updatedFast);
    } catch (error) {
        log('error', `Error updating fast: ${error.message}`);
        res.status(500).json({ error: 'Failed to update fast' });
    }
});

// Get Fasting History
/**
 * @swagger
 * /fasting/history:
 *   get:
 *     summary: Get fasting history
 *     tags: [Wellness & Metrics]
 *     description: Retrieves a paginated history of fasting logs for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of records to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip.
 *     responses:
 *       200:
 *         description: A list of fasting logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */

router.get('/history', async (req, res) => {
    const userId = req.userId;
    log('debug', `GET /history: Fetching history for userId: ${userId} with params:`, req.query);
    const { limit, offset } = req.query;
    try {
        const history = await fastingRepository.getFastingHistory(userId, limit, offset);
        res.json(history);
    } catch (error) {
        log('error', `Error fetching fasting history: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Get Stats
/**
 * @swagger
 * /fasting/stats:
 *   get:
 *     summary: Get fasting statistics
 *     tags: [Wellness & Metrics]
 *     description: Retrieves summary statistics for the user's fasting history.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Fasting statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_completed_fasts:
 *                   type: integer
 *                 total_minutes_fasted:
 *                   type: integer
 *                 average_duration_minutes:
 *                   type: number
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */

router.get('/stats', async (req, res) => {
    const userId = req.userId;
    log('debug', `GET /stats: Fetching stats for userId: ${userId}`);
    try {
        const stats = await fastingRepository.getFastingStats(userId);
        res.json(stats);
    } catch (error) {
        log('error', `Error fetching fasting stats: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get fasting logs within a date range
/**
 * @swagger
 * /fasting/history/range/{startDate}/{endDate}:
 *   get:
 *     summary: Get fasting logs by date range
 *     tags: [Wellness & Metrics]
 *     description: Retrieves completed fasting logs within a specified date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD).
 *       - in: path
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of fasting logs within the range.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */

router.get('/history/range/:startDate/:endDate', async (req, res) => {
    const userId = req.userId;
    const { startDate, endDate } = req.params;
    log('debug', `GET /history/range: start=${startDate}, end=${endDate}`);
    try {
        const logs = await fastingRepository.getFastingLogsByDateRange(userId, startDate, endDate);
        res.json(logs);
    } catch (error) {
        log('error', `Error fetching fasting logs by range: ${error.message}`, error);
        res.status(500).json({ error: 'Failed to fetch fasting logs by range' });
    }
});

module.exports = router;
