import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
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
/**
 * @swagger
 * /reports/training-consistency:
 *   get:
 *     summary: Get training consistency (training days, weekly streak, weekly sets per muscle)
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: Training consistency over the last 26 weeks.
 */
router.get('/training-consistency', authenticate, async (req, res, next) => {
  const { userId } = req.query;
  const targetUserId = userId || req.userId;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Target User ID is required.' });
  }
  if (userId && userId !== req.userId) {
    const hasPermission = await canAccessUserData(
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
    const data = await reportService.getTrainingConsistency(
      req.userId,
      String(targetUserId)
    );
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * A GET report keyed on `?userId=`: checks the `reports` permission for another
 * user's data, then answers with `load(authenticatedUser, targetUser)`.
 */
const ownReportHandler =
  (load: (userId: string, targetUserId: string) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.query;
    const targetUserId = userId || req.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }
    if (userId && userId !== req.userId) {
      const hasPermission = await canAccessUserData(
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
      res.status(200).json(await load(req.userId, String(targetUserId)));
    } catch (error) {
      next(error);
    }
  };
/**
 * @swagger
 * /reports/training-load:
 *   get:
 *     summary: Get training load (last 7 days against the 4-week average)
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: Weekly load, acute/chronic ratio, status and a rest hint.
 */
router.get(
  '/training-load',
  authenticate,
  ownReportHandler(reportService.getTrainingLoad)
);
/**
 * @swagger
 * /reports/fitness-fatigue:
 *   get:
 *     summary: Get the fitness / fatigue / form curve and today's readiness score
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: The 90-day curve, its status and a 0-100 readiness score with its factors.
 */
router.get(
  '/fitness-fatigue',
  authenticate,
  ownReportHandler(reportService.getFitnessFatigue)
);
/**
 * @swagger
 * /reports/run-estimates:
 *   get:
 *     summary: Get estimated VO2 max and running power from recent runs
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: 'string', format: 'uuid' }
 *     responses:
 *       200:
 *         description: An estimated VO2 max (median of runs in the last 6 weeks) and the average running power of the last 4 weeks; each is null without enough data.
 */
router.get(
  '/run-estimates',
  authenticate,
  ownReportHandler(reportService.getRunningEstimates)
);
export default router;
