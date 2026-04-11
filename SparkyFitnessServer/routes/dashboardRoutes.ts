import express from 'express';
import dashboardService from '../services/DashboardService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';
const router = express.Router();
/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics for external widgets
 *     tags: [Dashboard]
 *     description: Returns daily energy goal stats. Can be authenticated via Browser Session or API Key (x-api-key).
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to fetch stats for (YYYY-MM-DD). Defaults to today in user's timezone.
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully.
 *       401:
 *         description: Authentication required.
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const userId = req.activeUserId || req.authenticatedUserId;
    const tz = await loadUserTimezone(userId);
    const date = req.query.date || todayInZone(tz);
    log('info', `Dashboard stats requested for user ${userId} on date ${date}`);
    const stats = await dashboardService.getDashboardStats(userId, date);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
export default router;
