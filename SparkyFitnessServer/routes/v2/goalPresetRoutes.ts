import express, { RequestHandler } from 'express';
import { UuidParamSchema } from '../../schemas/measurementSchemas.js';
import {
  CreateGoalPresetBodySchema,
  UpdateGoalPresetBodySchema,
} from '../../schemas/goalPresetSchemas.js';

import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import goalPresetService from '../../services/goalPresetService.js';

const router = express.Router();

router.use(checkPermissionMiddleware('checkin'));
// Goal presets are personal — no onBehalfOfMiddleware needed.

/**
 * @swagger
 * /v2/goal-presets:
 *   post:
 *     summary: Create a new goal preset
 *     tags: [Goals & Personalization]
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
 *       400:
 *         description: Validation error.
 */
const createGoalPresetHandler: RequestHandler = async (req, res, next) => {
  try {
    const bodyResult = CreateGoalPresetBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: bodyResult.error.flatten().fieldErrors,
      });
      return;
    }
    const newPreset = await goalPresetService.createGoalPreset(
      req.userId,
      bodyResult.data
    );
    res.status(201).json(newPreset);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'A goal preset with this name already exists.'
    ) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * @swagger
 * /v2/goal-presets:
 *   get:
 *     summary: Get all goal presets for the authenticated user
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of goal presets.
 */
const getGoalPresetsHandler: RequestHandler = async (req, res, next) => {
  try {
    const presets = await goalPresetService.getGoalPresets(req.userId);
    res.status(200).json(presets);
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * @swagger
 * /v2/goal-presets/{id}:
 *   get:
 *     summary: Get a goal preset by ID
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Goal preset.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Goal preset not found.
 */
const getGoalPresetHandler: RequestHandler = async (req, res, next) => {
  try {
    const paramResult = UuidParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: paramResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { id } = paramResult.data;
    const preset = await goalPresetService.getGoalPreset(id, req.userId);
    if (!preset) {
      res.status(404).json({ error: 'Goal preset not found.' });
      return;
    }
    res.status(200).json(preset);
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * @swagger
 * /v2/goal-presets/{id}:
 *   put:
 *     summary: Update a goal preset
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoalPreset'
 *     responses:
 *       200:
 *         description: Goal preset updated successfully.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Goal preset not found.
 */
const updateGoalPresetHandler: RequestHandler = async (req, res, next) => {
  try {
    const paramResult = UuidParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: paramResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { id } = paramResult.data;

    const bodyResult = UpdateGoalPresetBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: bodyResult.error.flatten().fieldErrors,
      });
      return;
    }

    const updatedPreset = await goalPresetService.updateGoalPreset(
      id,
      req.userId,
      bodyResult.data
    );
    if (!updatedPreset) {
      res.status(404).json({ error: 'Goal preset not found.' });
      return;
    }
    res.status(200).json(updatedPreset);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'A goal preset with this name already exists.'
    ) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * @swagger
 * /v2/goal-presets/{id}:
 *   delete:
 *     summary: Delete a goal preset
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Goal preset deleted successfully.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Goal preset not found.
 */
const deleteGoalPresetHandler: RequestHandler = async (req, res, next) => {
  try {
    const paramResult = UuidParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: paramResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { id } = paramResult.data;
    const result = await goalPresetService.deleteGoalPreset(id, req.userId);
    if (!result) {
      res.status(404).json({ error: 'Goal preset not found.' });
      return;
    }
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.post('/', createGoalPresetHandler);
router.get('/', getGoalPresetsHandler);
router.get('/:id', getGoalPresetHandler);
router.put('/:id', updateGoalPresetHandler);
router.delete('/:id', deleteGoalPresetHandler);

module.exports = router;
