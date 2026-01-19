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
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
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
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User goals for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserGoal'
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
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               p_start_date: { type: 'string', format: 'date' }
 *               p_end_date: { type: 'string', format: 'date', nullable: true }
 *               calories: { type: 'number' }
 *               # ... other goal fields ...
 *             required: [p_start_date]
 *     responses:
 *       200:
 *         description: Timeline managed successfully.
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