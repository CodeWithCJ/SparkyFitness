const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { syncDailyTotals } = require('../services/mfpSyncService');
const { log } = require('../config/logging');
const moment = require('moment');

router.use(express.json());

/**
 * @swagger
 * /integrations/myfitnesspal/sync:
 *   post:
 *     summary: Manually trigger MyFitnessPal nutrition sync
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: 'string', format: 'date' }
 *               endDate: { type: 'string', format: 'date' }
 *             required: [startDate]
 */
router.post('/sync', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.body;

    if (!startDate) {
      return res.status(400).json({ error: 'startDate is required.' });
    }

    const start = moment(startDate, 'YYYY-MM-DD', true);
    const end = endDate ? moment(endDate, 'YYYY-MM-DD', true) : start.clone();

    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    if (start.isAfter(end)) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate.' });
    }

    // Limit range to 31 days to avoid overwhelming the API
    const daysDiff = end.diff(start, 'days');
    if (daysDiff > 31) {
      return res.status(400).json({ error: 'Date range cannot exceed 31 days.' });
    }

    const dates = [];
    let current = start.clone();
    while (current.isSameOrBefore(end)) {
      dates.push(current.format('YYYY-MM-DD'));
      current.add(1, 'days');
    }

    log('info', `mfpRoutes: Manual MFP sync requested for user ${userId} for ${dates.length} days`);

    // Trigger syncs sequentially to be safe with locking and rate limits
    for (const date of dates) {
      await syncDailyTotals(userId, date);
    }

    res.status(200).json({ 
      message: `MFP sync triggered successfully for ${dates.length} days.`,
      processedDates: dates 
    });
  } catch (error) {
    log('error', `mfpRoutes: Error triggering manual sync: ${error.message}`);
    next(error);
  }
});

/**
 * @swagger
 * /integrations/myfitnesspal/status:
 *   get:
 *     summary: Get MyFitnessPal connection status
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const externalProviderRepository = require('../models/externalProviderRepository');
    
    const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(
      userId,
      'myfitnesspal'
    );

    if (provider) {
      res.status(200).json({
        isLinked: !!(provider.app_id && provider.app_key),
        lastUpdated: provider.updated_at,
        tokenExpiresAt: provider.token_expires_at,
        message: 'MyFitnessPal is connected.',
      });
    } else {
      res.status(200).json({
        isLinked: false,
        message: 'MyFitnessPal is not connected.',
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
