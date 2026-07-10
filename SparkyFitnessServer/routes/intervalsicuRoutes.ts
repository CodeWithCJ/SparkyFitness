import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import intervalsIcuIntegrationService from '../integrations/intervalsicu/intervalsicuService.js';
import intervalsIcuService from '../services/intervalsicuService.js';
import { log } from '../config/logging.js';

const router = express.Router();

// All Intervals.ICU routes require authentication
router.use(authMiddleware.authenticate);

/**
 * GET /status
 * Get Intervals.ICU connection status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.userId;
    const status = await intervalsIcuService.getStatus(userId);
    res.json(status);
  } catch (error) {
    log(
      'error',
      `[intervalsicuRoutes] Error getting status: ${error instanceof Error ? error.message : String(error)}`
    );
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /sync
 * Trigger a manual Intervals.ICU data sync
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.body;
    log(
      'info',
      `[intervalsicuRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
    );
    const result = await intervalsIcuService.syncIntervalsIcuData(
      userId,
      'manual',
      startDate,
      endDate
    );
    res.json(result);
  } catch (error) {
    log(
      'error',
      `[intervalsicuRoutes] Error syncing data: ${error instanceof Error ? error.message : String(error)}`
    );
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * POST /disconnect
 * Disconnect Intervals.ICU integration
 */
router.post('/disconnect', async (req, res) => {
  try {
    const userId = req.userId;
    const result = await intervalsIcuService.disconnectIntervalsIcu(userId);
    res.json(result);
  } catch (error) {
    log(
      'error',
      `[intervalsicuRoutes] Error disconnecting: ${error instanceof Error ? error.message : String(error)}`
    );
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
