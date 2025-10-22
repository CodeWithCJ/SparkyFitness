const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const weeklyGoalPlanService = require('../services/weeklyGoalPlanService');

// Create a new weekly goal plan
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPlan = await weeklyGoalPlanService.createWeeklyGoalPlan(req.userId, req.body);
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});

// Get all weekly goal plans for a user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const plans = await weeklyGoalPlanService.getWeeklyGoalPlans(req.userId);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

// Get the active weekly goal plan for a user on a specific date
router.get('/active', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }
    const activePlan = await weeklyGoalPlanService.getActiveWeeklyGoalPlan(req.userId, date);
    res.status(200).json(activePlan);
  } catch (error) {
    next(error);
  }
});

// Update a weekly goal plan
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const updatedPlan = await weeklyGoalPlanService.updateWeeklyGoalPlan(req.params.id, req.userId, req.body);
    if (!updatedPlan) {
      return res.status(404).json({ message: 'Weekly goal plan not found or not authorized.' });
    }
    res.status(200).json(updatedPlan);
  } catch (error) {
    next(error);
  }
});

// Delete a weekly goal plan
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deletedPlan = await weeklyGoalPlanService.deleteWeeklyGoalPlan(req.params.id, req.userId);
    if (!deletedPlan) {
      return res.status(404).json({ message: 'Weekly goal plan not found or not authorized.' });
    }
    res.status(204).send(); // No content for successful deletion
  } catch (error) {
    next(error);
  }
});

module.exports = router;