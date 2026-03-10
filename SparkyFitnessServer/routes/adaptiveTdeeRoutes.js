const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const adaptiveTdeeService = require('../services/AdaptiveTdeeService');

/**
 * @swagger
 * /adaptive-tdee:
 *   get:
 *     summary: Get adaptive TDEE calculation
 *     tags: [Goals & Personalization]
 *     description: Calculates the user's adaptive Total Daily Energy Expenditure (TDEE) based on weight trends and calorie intake data. Requires at least 2 weight entries spanning 7+ days and 7+ days of calorie logs. Results are cached for 1 hour. Falls back to a BMR-based estimate if insufficient data is available.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to calculate TDEE for (YYYY-MM-DD). Defaults to today.
 *     responses:
 *       200:
 *         description: Adaptive TDEE calculation result.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdaptiveTdeeResult'
 *       401:
 *         description: Unauthorized.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    const result = await adaptiveTdeeService.calculateAdaptiveTdee(req.userId, date);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
