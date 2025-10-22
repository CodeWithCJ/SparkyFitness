const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const reviewService = require('../services/reviewService');

// Endpoint to get the count of items needing review
router.get('/needs-review-count', authenticate, async (req, res, next) => {
  try {
    const count = await reviewService.getNeedsReviewCount(req.userId);
    res.status(200).json({ count });
  } catch (error) {
    next(error);
  }
});

// Endpoint to get the list of items needing review
router.get('/needs-review', authenticate, async (req, res, next) => {
  try {
    const items = await reviewService.getNeedsReviewItems(req.userId);
    res.status(200).json(items);
  } catch (error) {
    next(error);
  }
});

module.exports = router;