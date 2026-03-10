const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const goalService = require('../services/goalService');

/**
 * @swagger
 * /goals/by-date/{date}:
 *   get:
 *     summary: Get goals for a specific date
 *     tags: [Goals & Personalization]
 *     description: Retrieves the user's nutritional and exercise goals for a specific date. Falls back through weekly plan presets, most recent past goal, then defaults if no exact match exists.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to get goals for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
 *       400:
 *         description: Date is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get('/by-date/:date', authenticate, checkPermissionMiddleware('diary'), async (req, res, next) => {
  const { date } = req.params;

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  try {
    const goals = await goalService.getUserGoals(req.userId, date);
    res.status(200).json(goals);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /goals/for-date:
 *   get:
 *     summary: Get goals for a date (query param)
 *     tags: [Goals & Personalization]
 *     description: Retrieves user goals for a specific date via query parameter. Supports an optional userId parameter for accessing another user's goals (requires family access permission).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to get goals for (YYYY-MM-DD).
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional user ID to fetch goals for (requires family access permission).
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
 *       400:
 *         description: Date is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get('/for-date', authenticate, checkPermissionMiddleware('diary'), async (req, res, next) => {
  const { date, userId } = req.query; // Check for userId in query (for backward compatibility if needed, but middleware handles it)

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  // Determine target user
  const targetUserId = userId || req.userId;

  try {
    const goals = await goalService.getUserGoals(targetUserId, date);
    res.status(200).json(goals);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /goals/manage-timeline:
 *   post:
 *     summary: Manage goal timeline (upsert goals over a range)
 *     tags: [Goals & Personalization]
 *     description: Creates or updates goals for a date or date range. When p_cascade is true and the date is today or future, applies the goal forward for 6 months.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_start_date
 *             properties:
 *               p_start_date:
 *                 type: string
 *                 format: date
 *                 description: The start date for the goal (YYYY-MM-DD).
 *               p_end_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 description: Optional end date for the goal range.
 *               p_cascade:
 *                 type: boolean
 *                 description: If true and date is today/future, cascades the goal forward for 6 months.
 *               calories:
 *                 type: number
 *               protein:
 *                 type: number
 *               carbs:
 *                 type: number
 *               fat:
 *                 type: number
 *               water_goal_ml:
 *                 type: number
 *               saturated_fat:
 *                 type: number
 *                 nullable: true
 *               polyunsaturated_fat:
 *                 type: number
 *                 nullable: true
 *               monounsaturated_fat:
 *                 type: number
 *                 nullable: true
 *               trans_fat:
 *                 type: number
 *                 nullable: true
 *               cholesterol:
 *                 type: number
 *                 nullable: true
 *               sodium:
 *                 type: number
 *                 nullable: true
 *               potassium:
 *                 type: number
 *                 nullable: true
 *               dietary_fiber:
 *                 type: number
 *                 nullable: true
 *               sugars:
 *                 type: number
 *                 nullable: true
 *               vitamin_a:
 *                 type: number
 *                 nullable: true
 *               vitamin_c:
 *                 type: number
 *                 nullable: true
 *               calcium:
 *                 type: number
 *                 nullable: true
 *               iron:
 *                 type: number
 *                 nullable: true
 *               protein_percentage:
 *                 type: number
 *                 nullable: true
 *               carbs_percentage:
 *                 type: number
 *                 nullable: true
 *               fat_percentage:
 *                 type: number
 *                 nullable: true
 *               breakfast_percentage:
 *                 type: number
 *                 nullable: true
 *               lunch_percentage:
 *                 type: number
 *                 nullable: true
 *               dinner_percentage:
 *                 type: number
 *                 nullable: true
 *               snacks_percentage:
 *                 type: number
 *                 nullable: true
 *               target_exercise_calories_burned:
 *                 type: number
 *                 nullable: true
 *               target_exercise_duration_minutes:
 *                 type: integer
 *                 nullable: true
 *               custom_nutrients:
 *                 type: object
 *                 nullable: true
 *                 description: Custom nutrient targets keyed by nutrient definition ID.
 *     responses:
 *       200:
 *         description: Timeline managed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Start date is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.post('/manage-timeline', authenticate, async (req, res, next) => {
  const authenticatedUserId = req.userId;
  const goalData = req.body;

  if (!goalData.p_start_date) {
    return res.status(400).json({ error: 'Start date is required.' });
  }

  try {
    const result = await goalService.manageGoalTimeline(authenticatedUserId, goalData);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;