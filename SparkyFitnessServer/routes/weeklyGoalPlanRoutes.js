const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const weeklyGoalPlanService = require('../services/weeklyGoalPlanService');

/**
 * @swagger
 * /weekly-goal-plans:
 *   post:
 *     summary: Create a new weekly goal plan
 *     tags: [Goals & Personalization]
 *     description: Creates a new weekly goal plan for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WeeklyGoalPlan'
 *     responses:
 *       201:
 *         description: The weekly goal plan was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeeklyGoalPlan'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPlan = await weeklyGoalPlanService.createWeeklyGoalPlan(req.userId, req.body);
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /weekly-goal-plans:
 *   get:
 *     summary: Get all weekly goal plans
 *     tags: [Goals & Personalization]
 *     description: Retrieves all weekly goal plans for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of weekly goal plans.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WeeklyGoalPlan'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const plans = await weeklyGoalPlanService.getWeeklyGoalPlans(req.userId);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /weekly-goal-plans/active:
 *   get:
 *     summary: Get the active weekly goal plan for a specific date
 *     tags: [Goals & Personalization]
 *     description: Retrieves the active weekly goal plan for the authenticated user on a specific date.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to check for an active plan (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: The active weekly goal plan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeeklyGoalPlan'
 *       400:
 *         description: Date query parameter is required.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /weekly-goal-plans/{id}:
 *   put:
 *     summary: Update an existing weekly goal plan
 *     tags: [Goals & Personalization]
 *     description: Updates an existing weekly goal plan.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the weekly goal plan to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WeeklyGoalPlan'
 *     responses:
 *       200:
 *         description: The weekly goal plan was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeeklyGoalPlan'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Weekly goal plan not found or not authorized.
 *       500:
 *         description: Internal server error.
 */
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

/**
 * @swagger
 * /weekly-goal-plans/{id}:
 *   delete:
 *     summary: Delete a weekly goal plan
 *     tags: [Goals & Personalization]
 *     description: Deletes a specific weekly goal plan.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the weekly goal plan to delete.
 *     responses:
 *       204:
 *         description: Weekly goal plan deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Weekly goal plan not found or not authorized.
 *       500:
 *         description: Internal server error.
 */
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
