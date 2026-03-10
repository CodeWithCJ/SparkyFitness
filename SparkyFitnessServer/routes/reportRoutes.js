const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const reportService = require('../services/reportService');

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get comprehensive reports data
 *     description: Returns nutrition, food, exercise, measurement, custom category, custom measurement, and sleep analytics data for the specified date range.
 *     tags:
 *       - AI & Insights
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Target user ID. Defaults to the authenticated user if not provided.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the report range (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the report range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Comprehensive reports data for the requested date range.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nutritionData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       calories:
 *                         type: number
 *                       protein:
 *                         type: number
 *                       carbs:
 *                         type: number
 *                       fat:
 *                         type: number
 *                       saturated_fat:
 *                         type: number
 *                       polyunsaturated_fat:
 *                         type: number
 *                       monounsaturated_fat:
 *                         type: number
 *                       trans_fat:
 *                         type: number
 *                       cholesterol:
 *                         type: number
 *                       sodium:
 *                         type: number
 *                       potassium:
 *                         type: number
 *                       dietary_fiber:
 *                         type: number
 *                       sugars:
 *                         type: number
 *                       vitamin_a:
 *                         type: number
 *                       vitamin_c:
 *                         type: number
 *                       calcium:
 *                         type: number
 *                       iron:
 *                         type: number
 *                       bmr:
 *                         type: number
 *                       include_bmr_in_net_calories:
 *                         type: boolean
 *                 tabularData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       food_name:
 *                         type: string
 *                       brand:
 *                         type: string
 *                       calories:
 *                         type: number
 *                 exerciseEntries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entry_date:
 *                         type: string
 *                         format: date
 *                       exercise_name:
 *                         type: string
 *                       sets:
 *                         type: array
 *                         items:
 *                           type: object
 *                       exercises:
 *                         type: object
 *                 measurementData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       entry_date:
 *                         type: string
 *                         format: date
 *                       weight:
 *                         type: number
 *                       height:
 *                         type: number
 *                       body_fat_percentage:
 *                         type: number
 *                 customCategories:
 *                   type: array
 *                   items:
 *                     type: object
 *                 customMeasurementsData:
 *                   type: object
 *                 sleepAnalyticsData:
 *                   type: object
 *       400:
 *         description: Missing required parameters.
 *       403:
 *         description: Forbidden, if the user does not have permission to view reports for the specified user.
 *       500:
 *         description: Server error.
 */
router.get('/', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;
  const targetUserId = userId || req.userId;

  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID (explicit or context), start date, and end date are required.' });
  }

  // Permission check only if explicit userId is provided that is different from req.userId
  if (userId && userId !== req.userId) {
    const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'reports', req.authenticatedUserId || req.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to view reports for this user.' });
    }
  }

  try {
    const reportData = await reportService.getReportsData(req.userId, targetUserId, startDate, endDate);
    res.status(200).json(reportData);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
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
 *     description: Returns daily nutrition summaries for the specified date range, including macronutrients and micronutrients.
 *     tags:
 *       - AI & Insights
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Target user ID. Defaults to the authenticated user if not provided.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the trend range (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the trend range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: An array of daily nutrition summaries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     format: date
 *                   calories:
 *                     type: number
 *                   protein:
 *                     type: number
 *                   carbs:
 *                     type: number
 *                   fat:
 *                     type: number
 *                   saturated_fat:
 *                     type: number
 *                   polyunsaturated_fat:
 *                     type: number
 *                   monounsaturated_fat:
 *                     type: number
 *                   trans_fat:
 *                     type: number
 *                   cholesterol:
 *                     type: number
 *                   sodium:
 *                     type: number
 *                   potassium:
 *                     type: number
 *                   dietary_fiber:
 *                     type: number
 *                   sugars:
 *                     type: number
 *                   vitamin_a:
 *                     type: number
 *                   vitamin_c:
 *                     type: number
 *                   calcium:
 *                     type: number
 *                   iron:
 *                     type: number
 *                   bmr:
 *                     type: number
 *                   include_bmr_in_net_calories:
 *                     type: boolean
 *       400:
 *         description: Missing required parameters.
 *       403:
 *         description: Forbidden, if the user does not have permission to view reports for the specified user.
 *       500:
 *         description: Server error.
 */
router.get('/mini-nutrition-trends', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;
  const targetUserId = userId || req.userId;

  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
  }

  // Permission check if explicit userId provided
  if (userId && userId !== req.userId) {
    const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'reports', req.authenticatedUserId || req.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to view reports for this user.' });
    }
  }

  try {
    const formattedResults = await reportService.getMiniNutritionTrends(req.userId, targetUserId, startDate, endDate);
    res.status(200).json(formattedResults);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
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
 *     description: Returns daily nutrition summaries alongside the user's calorie, protein, carbs, and fat goals for the specified date range.
 *     tags:
 *       - AI & Insights
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Target user ID. Defaults to the authenticated user if not provided.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the trend range (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the trend range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: An array of daily nutrition data with associated goal values.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     format: date
 *                   calories:
 *                     type: number
 *                   protein:
 *                     type: number
 *                   carbs:
 *                     type: number
 *                   fat:
 *                     type: number
 *                   calorieGoal:
 *                     type: number
 *                   proteinGoal:
 *                     type: number
 *                   carbsGoal:
 *                     type: number
 *                   fatGoal:
 *                     type: number
 *       400:
 *         description: Missing required parameters.
 *       403:
 *         description: Forbidden, if the user does not have permission to view reports for the specified user.
 *       500:
 *         description: Server error.
 */
router.get('/nutrition-trends-with-goals', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate } = req.query;
  const targetUserId = userId || req.userId;

  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
  }

  // Permission check if explicit userId provided
  if (userId && userId !== req.userId) {
    const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'reports', req.authenticatedUserId || req.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to view reports for this user.' });
    }
  }

  try {
    const formattedResults = await reportService.getNutritionTrendsWithGoals(req.userId, targetUserId, startDate, endDate);
    res.status(200).json(formattedResults);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /reports/exercise-dashboard:
 *   get:
 *     summary: Get exercise dashboard data
 *     description: Returns exercise analytics including key stats, personal records, muscle group volume, consistency streaks, recovery data, and more for the specified date range. Supports optional filters for equipment, muscle group, and exercise.
 *     tags:
 *       - AI & Insights
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Target user ID. Defaults to the authenticated user if not provided.
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the dashboard range (YYYY-MM-DD).
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the dashboard range (YYYY-MM-DD).
 *       - in: query
 *         name: equipment
 *         schema:
 *           type: string
 *         description: Filter results by equipment type (e.g., 'barbell', 'dumbbell').
 *       - in: query
 *         name: muscle
 *         schema:
 *           type: string
 *         description: Filter results by target muscle group (e.g., 'chest', 'back').
 *       - in: query
 *         name: exercise
 *         schema:
 *           type: string
 *         description: Filter results by a specific exercise name.
 *     responses:
 *       200:
 *         description: Exercise dashboard analytics data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keyStats:
 *                   type: object
 *                   properties:
 *                     totalWorkouts:
 *                       type: integer
 *                     totalVolume:
 *                       type: number
 *                     totalReps:
 *                       type: integer
 *                 prData:
 *                   type: object
 *                   description: Personal record data keyed by exercise name.
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       oneRM:
 *                         type: number
 *                       date:
 *                         type: string
 *                         format: date
 *                       weight:
 *                         type: number
 *                       reps:
 *                         type: integer
 *                 bestSetRepRange:
 *                   type: object
 *                   description: Best sets organized by rep range.
 *                 muscleGroupVolume:
 *                   type: object
 *                   description: Total volume keyed by muscle group name.
 *                   additionalProperties:
 *                     type: number
 *                 consistencyData:
 *                   type: object
 *                   properties:
 *                     currentStreak:
 *                       type: integer
 *                     longestStreak:
 *                       type: integer
 *                     weeklyFrequency:
 *                       type: number
 *                     monthlyFrequency:
 *                       type: number
 *                 recoveryData:
 *                   type: object
 *                   description: Last workout date keyed by muscle group name.
 *                   additionalProperties:
 *                     type: string
 *                     format: date
 *                 prProgressionData:
 *                   type: object
 *                   description: PR progression history keyed by exercise name.
 *                 exerciseVarietyData:
 *                   type: object
 *                   description: Number of distinct exercises keyed by muscle group.
 *                   additionalProperties:
 *                     type: integer
 *                 setPerformanceData:
 *                   type: object
 *                   description: Set-level performance data.
 *                 exerciseEntries:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing required parameters.
 *       403:
 *         description: Forbidden, if the user does not have permission to view reports for the specified user.
 *       500:
 *         description: Server error.
 */
router.get('/exercise-dashboard', authenticate, async (req, res, next) => {
  const { userId, startDate, endDate, equipment, muscle, exercise } = req.query;
  const targetUserId = userId || req.userId;

  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
  }

  // Permission check if explicit userId provided
  if (userId && userId !== req.userId) {
    const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'reports', req.authenticatedUserId || req.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to view reports for this user.' });
    }
  }

  try {
    const dashboardData = await reportService.getExerciseDashboardData(req.userId, targetUserId, startDate, endDate, equipment, muscle, exercise);
    res.status(200).json(dashboardData);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;