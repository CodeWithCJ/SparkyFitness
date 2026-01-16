const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const reviewService = require('../services/reviewService');

/**
 * @swagger
 * /reviews/needs-review-count:
 *   get:
 *     summary: Get the count of items needing review
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Count of items.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: 'integer' }
 */
router.get('/needs-review-count', authenticate, async (req, res, next) => {
  try {
    const count = await reviewService.getNeedsReviewCount(req.userId);
    res.status(200).json({ count });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /reviews/needs-review:
 *   get:
 *     summary: Get the list of items needing review
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of items needing review.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: 'string', format: 'uuid' }
 *                   type: { type: 'string', enum: ['food', 'exercise'] }
 *                   name: { type: 'string' }
 */
router.get('/needs-review', authenticate, async (req, res, next) => {
  try {
    const items = await reviewService.getNeedsReviewItems(req.userId);
    res.status(200).json(items);
  } catch (error) {
    next(error);
  }
});

module.exports = router;