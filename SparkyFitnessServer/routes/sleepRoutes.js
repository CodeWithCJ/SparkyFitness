const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const measurementService = require('../services/measurementService');
const sleepAnalyticsService = require('../services/sleepAnalyticsService'); // Import sleepAnalyticsService
const { log } = require('../config/logging');

// Endpoint for fetching sleep analytics
router.get('/analytics', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    const analyticsData = await sleepAnalyticsService.getSleepAnalytics(req.userId, startDate, endDate);
    res.status(200).json(analyticsData);
  } catch (error) {
    log('error', "Error fetching sleep analytics:", error);
    next(error);
  }
});

// Endpoint for manual sleep entry from the frontend
router.post('/manual_entry', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { entry_date, bedtime, wake_time, duration_in_seconds, stage_events } = req.body;
    if (!entry_date || !bedtime || !wake_time || !duration_in_seconds) {
      return res.status(400).json({ error: "Missing required fields: entry_date, bedtime, wake_time, or duration_in_seconds." });
    }

    const sleepEntryData = {
      entry_date: entry_date, // Use the entry_date provided by the frontend
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: duration_in_seconds,
      source: 'manual',
      stage_events: stage_events // Pass stage_events to the service
    };

    // Use the processSleepEntry function from the measurementService
    const result = await measurementService.processSleepEntry(req.userId, req.userId, sleepEntryData);
    res.status(200).json(result);
  } catch (error) {
    log('error', "Error during manual sleep entry:", error);
    next(error);
  }
});

// Endpoint for fetching sleep entries for the frontend
router.get('/', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    // Use the getSleepEntriesByUserIdAndDateRange function from the measurementService
    const sleepEntries = await measurementService.getSleepEntriesByUserIdAndDateRange(req.userId, startDate, endDate);
    res.status(200).json(sleepEntries);
  } catch (error) {
    log('error', "Error fetching sleep entries:", error);
    next(error);
  }
});

// Endpoint for updating an existing sleep entry
router.put('/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bedtime, wake_time, duration_in_seconds, stage_events } = req.body;

    const updatedSleepEntryData = {
      bedtime: bedtime ? new Date(bedtime) : undefined,
      wake_time: wake_time ? new Date(wake_time) : undefined,
      duration_in_seconds: duration_in_seconds,
      stage_events: stage_events,
    };

    const result = await measurementService.updateSleepEntry(req.userId, id, updatedSleepEntryData);
    res.status(200).json(result);
  } catch (error) {
    log('error', `Error updating sleep entry with ID ${req.params.id}:`, error);
    next(error);
  }
});

// Endpoint for deleting a sleep entry
router.delete('/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await measurementService.deleteSleepEntry(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    log('error', `Error deleting sleep entry with ID ${req.params.id}:`, error);
    next(error);
  }
});

module.exports = router;