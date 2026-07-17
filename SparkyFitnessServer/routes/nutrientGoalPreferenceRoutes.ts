import express from 'express';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { log } from '../config/logging.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Nutrition & Meals
 *   description: Food database, meal planning, meal types, and nutritional tracking.
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     NutrientGoalPreference:
 *       type: object
 *       properties:
 *         goalType:
 *           type: string
 *           enum: [minimum, maximum, target]
 *           description: How progress toward this nutrient's goal should be interpreted.
 *         targetMin:
 *           type: number
 *           nullable: true
 *           description: Lower bound of the acceptable band (only when goalType is "target").
 *         targetMax:
 *           type: number
 *           nullable: true
 *           description: Upper bound of the acceptable band (only when goalType is "target").
 */
/**
 * @swagger
 * /nutrient-goal-preferences:
 *   get:
 *     summary: Get effective goal-direction preferences for every nutrient
 *     tags: [Nutrition & Meals]
 *     description: Returns a map of nutrient key -> effective goal direction (user override merged with built-in defaults) for all predefined nutrients and the user's custom nutrients.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Map of nutrient key to NutrientGoalPreference.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 $ref: '#/components/schemas/NutrientGoalPreference'
 *       401:
 *         description: Unauthorized.
 */
router.get('/', async (req, res, next) => {
  try {
    const preferences =
      await nutrientGoalPreferenceService.getEffectiveGoalTypes(req.userId);
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /nutrient-goal-preferences/{nutrientKey}:
 *   put:
 *     summary: Set a nutrient's goal-direction override
 *     tags: [Nutrition & Meals]
 *     description: Upserts the authenticated user's goal-direction override for a single nutrient (predefined or custom).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: nutrientKey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalType
 *             properties:
 *               goalType:
 *                 type: string
 *                 enum: [minimum, maximum, target]
 *               targetMin:
 *                 type: number
 *               targetMax:
 *                 type: number
 *     responses:
 *       200:
 *         description: The upserted preference.
 *       400:
 *         description: Invalid goalType or missing/invalid target band.
 *       401:
 *         description: Unauthorized.
 */
router.put('/:nutrientKey', async (req, res, next) => {
  try {
    const { nutrientKey } = req.params;
    const { goalType, targetMin, targetMax } = req.body;
    const preference = await nutrientGoalPreferenceService.upsertGoalPreference(
      req.userId,
      nutrientKey,
      goalType,
      targetMin,
      targetMax
    );
    res.json(preference);
  } catch (error) {
    log(
      'error',
      `Error upserting nutrient goal preference: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { userId: req.userId }
    );
    if (error instanceof Error) {
      res.status(400).json({ message: error.message });
      return;
    }
    next(error);
  }
});

/**
 * @swagger
 * /nutrient-goal-preferences/{nutrientKey}:
 *   delete:
 *     summary: Reset a nutrient's goal direction to its built-in default
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: nutrientKey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The resolved built-in default after resetting.
 *       401:
 *         description: Unauthorized.
 */
router.delete('/:nutrientKey', async (req, res, next) => {
  try {
    const { nutrientKey } = req.params;
    const result = await nutrientGoalPreferenceService.resetGoalPreference(
      req.userId,
      nutrientKey
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
