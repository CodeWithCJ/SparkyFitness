const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const goalPresetService = require('../services/goalPresetService');

/**
 * @swagger
 * /goal-presets:
 *   post:
 *     summary: Create a new goal preset
 *     tags: [Goals & Personalization]
 *     description: Creates a new goal preset for the authenticated user. If macro percentages are provided, grams are calculated automatically from calories.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoalPreset'
 *     responses:
 *       201:
 *         description: Goal preset created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoalPreset'
 *       401:
 *         description: Unauthorized.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPreset = await goalPresetService.createGoalPreset(req.userId, req.body);
    res.status(201).json(newPreset);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /goal-presets:
 *   get:
 *     summary: Get all goal presets for the user
 *     tags: [Goals & Personalization]
 *     description: Retrieves all goal presets for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of goal presets.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/GoalPreset'
 *       401:
 *         description: Unauthorized.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const presets = await goalPresetService.getGoalPresets(req.userId);
    res.status(200).json(presets);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /goal-presets/{id}:
 *   get:
 *     summary: Get a specific goal preset by ID
 *     tags: [Goals & Personalization]
 *     description: Retrieves a specific goal preset by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the goal preset.
 *     responses:
 *       200:
 *         description: The goal preset.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoalPreset'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Goal preset not found.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const preset = await goalPresetService.getGoalPreset(req.params.id, req.userId);
    if (!preset) {
      return res.status(404).json({ message: 'Goal preset not found.' });
    }
    res.status(200).json(preset);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /goal-presets/{id}:
 *   put:
 *     summary: Update a goal preset
 *     tags: [Goals & Personalization]
 *     description: Updates an existing goal preset. If macro percentages are provided, grams are recalculated from calories.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the goal preset to update.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoalPreset'
 *     responses:
 *       200:
 *         description: Goal preset updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoalPreset'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Goal preset not found or not authorized.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const updatedPreset = await goalPresetService.updateGoalPreset(req.params.id, req.userId, req.body);
    if (!updatedPreset) {
      return res.status(404).json({ message: 'Goal preset not found or not authorized.' });
    }
    res.status(200).json(updatedPreset);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /goal-presets/{id}:
 *   delete:
 *     summary: Delete a goal preset
 *     tags: [Goals & Personalization]
 *     description: Deletes a specific goal preset.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the goal preset to delete.
 *     responses:
 *       204:
 *         description: Deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Goal preset not found or not authorized.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deletedPreset = await goalPresetService.deleteGoalPreset(req.params.id, req.userId);
    if (!deletedPreset) {
      return res.status(404).json({ message: 'Goal preset not found or not authorized.' });
    }
    res.status(204).send(); // No content for successful deletion
  } catch (error) {
    next(error);
  }
});

module.exports = router;