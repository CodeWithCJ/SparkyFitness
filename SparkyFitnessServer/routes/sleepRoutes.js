const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const measurementService = require('../services/measurementService');
const sleepAnalyticsService = require('../services/sleepAnalyticsService'); // Import sleepAnalyticsService
const { log } = require('../config/logging');

/**
 * @swagger
 * /sleep/analytics:
 *   get:
 *     summary: Get sleep analytics
 *     tags: [Wellness & Metrics]
 *     description: Retrieves aggregated sleep analytics for a specific date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
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
 *         description: Sleep analytics data.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SleepAnalytics'
 *       400:
 *         description: Missing required query parameters.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/analytics', authenticate, checkPermissionMiddleware('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    const targetUserId = userId || req.userId;

    const analyticsData = await sleepAnalyticsService.getSleepAnalytics(targetUserId, startDate, endDate);
    res.status(200).json(analyticsData);
  } catch (error) {
    log('error', "Error fetching sleep analytics:", error);
    next(error);
  }
});

/**
 * @swagger
 * /sleep/manual_entry:
 *   post:
 *     summary: Create a manual sleep entry
 *     tags: [Wellness & Metrics]
 *     description: Allows the user to manually enter sleep data.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               bedtime:
 *                 type: string
 *                 format: date-time
 *               wake_time:
 *                 type: string
 *                 format: date-time
 *               duration_in_seconds:
 *                 type: integer
 *               stage_events:
 *                 type: array
 *                 items:
 *                   type: object
 *             required: [entry_date, bedtime, wake_time, duration_in_seconds]
 *     responses:
 *       200:
 *         description: Sleep entry processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SleepEntry'
 */
router.post('/manual_entry', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { entry_date, bedtime, wake_time, duration_in_seconds, stage_events } = req.body;
    if (!entry_date || !bedtime || !wake_time || !duration_in_seconds) {
      return res.status(400).json({ error: "Missing required fields: entry_date, bedtime, wake_time, or duration_in_seconds." });
    }

    const sleepEntryData = {
      entry_date: entry_date,
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: duration_in_seconds,
      source: 'manual',
      stage_events: stage_events
    };

    const result = await measurementService.processSleepEntry(req.userId, req.userId, sleepEntryData);
    res.status(200).json(result);
  } catch (error) {
    log('error', "Error during manual sleep entry:", error);
    next(error);
  }
});

/**
 * @swagger
 * /sleep:
 *   get:
 *     summary: Get sleep entries within a date range
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: A list of sleep entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SleepEntry'
 */
router.get('/', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    const targetUserId = userId || req.userId;

    if (userId && userId !== req.userId) {
      const permissionUtils = require('../utils/permissionUtils');
      const hasPermission = await permissionUtils.canAccessUserData(userId, 'reports', req.userId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to access this user\'s sleep data' });
      }
    }

    const sleepEntries = await measurementService.getSleepEntriesByUserIdAndDateRange(targetUserId, startDate, endDate);
    res.status(200).json(sleepEntries);
  } catch (error) {
    log('error', "Error fetching sleep entries:", error);
    next(error);
  }
});

/**
 * @swagger
 * /sleep/details:
 *   get:
 *     summary: Get sleep entries details within a date range
 *     tags: [Wellness & Metrics]
 *     description: This endpoint currently returns the same as the main GET /sleep endpoint.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Sleep entries details.
 */
router.get('/details', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    const targetUserId = userId || req.userId;

    if (userId && userId !== req.userId) {
      const permissionUtils = require('../utils/permissionUtils');
      const hasPermission = await permissionUtils.canAccessUserData(userId, 'reports', req.userId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to access this user\'s sleep data' });
      }
    }

    const sleepEntries = await measurementService.getSleepEntriesByUserIdAndDateRange(targetUserId, startDate, endDate);
    res.status(200).json(sleepEntries);
  } catch (error) {
    log('error', "Error fetching sleep entries details:", error);
    next(error);
  }
});

/**
 * @swagger
 * /sleep/{id}:
 *   put:
 *     summary: Update an existing sleep entry
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
 *               bedtime:
 *                 type: string
 *                 format: date-time
 *               wake_time:
 *                 type: string
 *                 format: date-time
 *               duration_in_seconds:
 *                 type: integer
 *               stage_events:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Sleep entry updated successfully.
 */
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

    const result = await measurementService.updateSleepEntry(req.userId, id, req.originalUserId || req.userId, updatedSleepEntryData);
    res.status(200).json(result);
  } catch (error) {
    log('error', `Error updating sleep entry with ID ${req.params.id}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /sleep/{id}:
 *   delete:
 *     summary: Delete a sleep entry
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
 *         description: Sleep entry deleted successfully.
 */
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
