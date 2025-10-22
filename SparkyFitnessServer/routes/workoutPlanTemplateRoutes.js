const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const workoutPlanTemplateService = require('../services/workoutPlanTemplateService');

// Create a new workout plan template
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { currentClientDate, ...planData } = req.body;
    const newPlan = await workoutPlanTemplateService.createWorkoutPlanTemplate(req.userId, planData, currentClientDate);
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});

// Get all workout plan templates for the authenticated user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const plans = await workoutPlanTemplateService.getWorkoutPlanTemplatesByUserId(req.userId);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

// Get a specific workout plan template by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const plan = await workoutPlanTemplateService.getWorkoutPlanTemplateById(req.userId, req.params.id);
    res.status(200).json(plan);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout plan template not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Update an existing workout plan template
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { currentClientDate, ...updateData } = req.body;
    const updatedPlan = await workoutPlanTemplateService.updateWorkoutPlanTemplate(req.userId, req.params.id, updateData, currentClientDate);
    res.status(200).json(updatedPlan);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout plan template not found or could not be updated.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Delete a workout plan template
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await workoutPlanTemplateService.deleteWorkoutPlanTemplate(req.userId, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Workout plan template not found or could not be deleted.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Get the active workout plan for a specific date
router.get('/active/:date', authenticate, async (req, res, next) => {
  try {
    const activePlan = await workoutPlanTemplateService.getActiveWorkoutPlanForDate(req.userId, req.params.date);
    res.status(200).json(activePlan);
  } catch (error) {
    next(error);
  }
});

module.exports = router;