import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import reportService from '../services/reportService.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
const router = express.Router();
/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get comprehensive reports data
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: 'string', format: 'uuid' }
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *     responses:
 *       200:
 *         description: Reports data.
 */
router.get('/', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;

  const targetUserId = userId || req.userId;
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({
      error:
        'Target User ID (explicit or context), start date, and end date are required.',
    });
  }
  // Permission check only if explicit userId is provided that is different from req.userId

  if (userId && userId !== req.userId) {
    const hasPermission = await { canAccessUserData }.canAccessUserData(
      userId,
      'reports',

      req.authenticatedUserId || req.userId
    );
    if (!hasPermission) {
      return res.status(403).json({
        error:
          'Forbidden: You do not have permission to view reports for this user.',
      });
    }
  }
  try {
    const reportData = await reportService.getReportsData(
      req.userId,
      targetUserId,
      startDate,
      endDate
    );
    res.status(200).json(reportData);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /reports/mini-nutrition-trends:
 *   get:
 *     summary: Get mini nutrition trends
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: 'string', format: 'uuid' }
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *     responses:
 *       200:
 *         description: Mini nutrition trends.
 */
router.get('/mini-nutrition-trends', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;

  const targetUserId = userId || req.userId;
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'Target User ID, start date, and end date are required.',
    });
  }
  // Permission check if explicit userId provided

  if (userId && userId !== req.userId) {
    const hasPermission = await { canAccessUserData }.canAccessUserData(
      userId,
      'reports',

      req.authenticatedUserId || req.userId
    );
    if (!hasPermission) {
      return res.status(403).json({
        error:
          'Forbidden: You do not have permission to view reports for this user.',
      });
    }
  }
  try {
    const formattedResults = await reportService.getMiniNutritionTrends(
      req.userId,
      targetUserId,
      startDate,
      endDate
    );
    res.status(200).json(formattedResults);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /reports/nutrition-trends-with-goals:
 *   get:
 *     summary: Get nutrition trends with goals
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: 'string', format: 'uuid' }
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *     responses:
 *       200:
 *         description: Nutrition trends with goals.
 */
router.get(
  '/nutrition-trends-with-goals',
  authenticate,
  async (req, res, next) => {
    const { userId, startDate, endDate } = req.query;

    const targetUserId = userId || req.userId;
    if (!targetUserId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Target User ID, start date, and end date are required.',
      });
    }
    // Permission check if explicit userId provided

    if (userId && userId !== req.userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        userId,
        'reports',

        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to view reports for this user.',
        });
      }
    }
    try {
      const formattedResults = await reportService.getNutritionTrendsWithGoals(
        req.userId,
        targetUserId,
        startDate,
        endDate
      );
      res.status(200).json(formattedResults);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /reports/exercise-dashboard:
 *   get:
 *     summary: Get exercise dashboard data
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: 'string', format: 'uuid' }
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: 'string', format: 'date' }
 *       - in: query
 *         name: equipment
 *         schema: { type: 'string' }
 *       - in: query
 *         name: muscle
 *         schema: { type: 'string' }
 *       - in: query
 *         name: exercise
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Exercise dashboard data.
 */
router.get('/exercise-dashboard', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate, equipment, muscle, exercise } = req.query;

  const targetUserId = userId || req.userId;
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'Target User ID, start date, and end date are required.',
    });
  }
  // Permission check if explicit userId provided

  if (userId && userId !== req.userId) {
    const hasPermission = await { canAccessUserData }.canAccessUserData(
      userId,
      'reports',

      req.authenticatedUserId || req.userId
    );
    if (!hasPermission) {
      return res.status(403).json({
        error:
          'Forbidden: You do not have permission to view reports for this user.',
      });
    }
  }
  try {
    const dashboardData = await reportService.getExerciseDashboardData(
      req.userId,
      targetUserId,
      startDate,
      endDate,
      equipment,
      muscle,
      exercise
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
export default router;
