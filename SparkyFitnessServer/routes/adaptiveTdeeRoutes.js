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
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Adaptive TDEE details.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await adaptiveTdeeService.calculateAdaptiveTdee(req.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
