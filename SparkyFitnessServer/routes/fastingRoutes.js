const express = require('express');
const router = express.Router();
const fastingRepository = require('../models/fastingRepository');
const moodRepository = require('../models/moodRepository');
const { log } = require('../config/logging');
const { authenticate } = require('../middleware/authMiddleware');
// Apply authentication middleware to all routes
router.use(authenticate);

// Get current active fast
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
