import express, { RequestHandler } from 'express';
import { getDailySummary } from '../services/dailySummaryService';

const { log } = require('../config/logging');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const { canAccessUserData } = require('../utils/permissionUtils');

const router = express.Router();

router.use(checkPermissionMiddleware('diary'));

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @swagger
 * /daily-summary:
 *   get:
 *     summary: Get consolidated daily summary
 *     tags: [Dashboard]
 *     description: Returns goals, food entries, exercise sessions, and water intake for a single date in one response.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-03-26"
 *         description: Date in YYYY-MM-DD format
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional user ID for family access
 *     responses:
 *       200:
 *         description: Daily summary containing goals, food entries, exercise sessions, and water intake
 *       400:
 *         description: Missing or invalid date parameter
 *       403:
 *         description: User does not have permission to access this resource
 *       500:
 *         description: Internal server error
 */
const handler: RequestHandler = async (req, res, next) => {
  try {
    const date = req.query.date as string | undefined;
    if (!date || !DATE_REGEX.test(date)) {
      res.status(400).json({
        error: 'Missing or invalid date query parameter (expected YYYY-MM-DD)',
      });
      return;
    }

    const queryUserId = req.query.userId as string | undefined;
    const targetUserId = queryUserId || req.userId;
    const actorUserId = req.originalUserId || req.userId;

    // Family access: either explicit ?userId param, or onBehalfOfMiddleware
    // rewrote req.userId via sparky_active_user_id header.
    const isFamilyAccess = targetUserId !== actorUserId;

    if (isFamilyAccess) {
      const hasPermission = await canAccessUserData(
        targetUserId,
        'diary',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Water intake requires checkin permission, not diary. When accessing
    // another user's data, only include water if the actor also has checkin access.
    let includeWater = true;
    if (isFamilyAccess) {
      includeWater = await canAccessUserData(
        targetUserId,
        'checkin',
        actorUserId
      );
    }

    const result = await getDailySummary({
      actorUserId,
      targetUserId,
      date,
      includeWater,
    });
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.get('/', handler);

module.exports = router;
