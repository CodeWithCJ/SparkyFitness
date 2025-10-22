const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const reportService = require('../services/reportService');

// New endpoint for reports
router.get('/', authenticate, async (req, res, next) => {
  const { userId: targetUserId, startDate, endDate } = req.query;
 
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
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

// Endpoint to fetch mini nutrition trends for a specific user and date range
router.get('/mini-nutrition-trends', authenticate, async (req, res, next) => {
  const { userId: targetUserId, startDate, endDate } = req.query;
 
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
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

router.get('/nutrition-trends-with-goals', authenticate, async (req, res, next) => {
  const { userId: targetUserId, startDate, endDate } = req.query;
 
  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
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

router.get('/exercise-dashboard', authenticate, async (req, res, next) => {
  const { userId: targetUserId, startDate, endDate, equipment, muscle, exercise } = req.query;

  if (!targetUserId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Target User ID, start date, and end date are required.' });
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