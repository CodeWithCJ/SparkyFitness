import express from 'express';
import dashboardService from '../services/DashboardService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';
const router = express.Router();
router.use(authenticate);
router.use(checkPermissionMiddleware('diary'));
/**
 * @swagger
 * /dashboard/stats:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eaten:
 *                   type: integer
 *                   description: Food and supplement kcal logged for the day.
 *                 burned:
 *                   type: integer
 *                   description: >
 *                     Resolved exercise calories plus BMR when the user enables
 *                     "Include BMR in Net Calories". Exercise is
 *                     max(device Active Calories, logged workouts + background steps),
 *                     never their sum.
 *                 remaining:
 *                   type: integer
 *                   description: Budget left, per the user's calorie goal adjustment mode.
 *                 goal:
 *                   type: integer
 *                 net:
 *                   type: integer
 *                   description: eaten - burned.
 *                 progress:
 *                   type: integer
 *                   minimum: 0
 *                   description: >
 *                     Percent of the goal consumed. Not capped at 100 — a day over
 *                     budget reports above 100, matching the Diary.
 *                 steps:
 *                   type: integer
 *                   description: Total step count from the day's check-in, or 0.
 *                 stepCalories:
 *                   type: integer
 *                   description: >
 *                     kcal from steps no logged workout already accounted for. 0 when
 *                     the caller lacks checkin permission.
 *                 bmr:
 *                   type: integer
 *                 unit:
 *                   type: string
 *                   example: kcal
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: >
 *           Family access denied — the caller lacks `diary` permission on the
 *           requested user.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const actorUserId = req.originalUserId || req.userId;
    const userId = req.activeUserId || req.authenticatedUserId;
    const tz = await loadUserTimezone(userId);
    const date =
      typeof req.query.date === 'string' ? req.query.date : todayInZone(tz);
    log('info', `Dashboard stats requested for user ${userId} on date ${date}`);

    const isFamilyAccess = userId !== actorUserId;
    if (isFamilyAccess) {
      const hasDiaryAccess = await canAccessUserData(
        userId,
        'diary',
        actorUserId
      );
      if (!hasDiaryAccess) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    let includeCheckin = true;
    if (isFamilyAccess) {
      includeCheckin = await canAccessUserData(userId, 'checkin', actorUserId);
    }

    const stats = await dashboardService.getDashboardStats(
      userId,
      date,
      includeCheckin
    );
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
export default router;
