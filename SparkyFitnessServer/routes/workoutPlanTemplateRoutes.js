const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const workoutPlanTemplateService = require('../services/workoutPlanTemplateService');

/**
 * @swagger
 * /workout-plan-templates:
 *   post:
 *     summary: Create a new workout plan template
 *     tags: [Fitness & Workouts]
 *     description: Creates a new workout plan template for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WorkoutPlanTemplate'
 *     responses:
 *       201:
 *         description: The workout plan template was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPlanTemplate'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { currentClientDate, ...planData } = req.body;
    const newPlan = await workoutPlanTemplateService.createWorkoutPlanTemplate(req.userId, planData, currentClientDate);
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /workout-plan-templates:
 *   get:
 *     summary: Get all workout plan templates
 *     tags: [Fitness & Workouts]
 *     description: Retrieves all workout plan templates for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of workout plan templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkoutPlanTemplate'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const plans = await workoutPlanTemplateService.getWorkoutPlanTemplatesByUserId(req.userId);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /workout-plan-templates/{id}:
 *   get:
 *     summary: Get a specific workout plan template by ID
 *     tags: [Fitness & Workouts]
 *     description: Retrieves a specific workout plan template by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout plan template to retrieve.
 *     responses:
 *       200:
 *         description: The requested workout plan template.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPlanTemplate'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout plan template not found.
 *       500:
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /workout-plan-templates/{id}:
 *   put:
 *     summary: Update an existing workout plan template
 *     tags: [Fitness & Workouts]
 *     description: Updates an existing workout plan template.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout plan template to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WorkoutPlanTemplate'
 *     responses:
 *       200:
 *         description: The workout plan template was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPlanTemplate'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout plan template not found or could not be updated.
 *       500:
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /workout-plan-templates/{id}:
 *   delete:
 *     summary: Delete a workout plan template
 *     tags: [Fitness & Workouts]
 *     description: Deletes a specific workout plan template.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the workout plan template to delete.
 *     responses:
 *       200:
 *         description: Workout plan template deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workout plan template not found or could not be deleted.
 *       500:
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /workout-plan-templates/active/{date}:
 *   get:
 *     summary: Get the active workout plan for a specific date
 *     tags: [Fitness & Workouts]
 *     description: Retrieves the active workout plan for the authenticated user on a given date.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to check for an active plan (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: The active workout plan for the date.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkoutPlanTemplate'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/active/:date', authenticate, async (req, res, next) => {
  try {
    const activePlan = await workoutPlanTemplateService.getActiveWorkoutPlanForDate(req.userId, req.params.date);
    res.status(200).json(activePlan);
  } catch (error) {
    next(error);
  }
});
module.exports = router;
