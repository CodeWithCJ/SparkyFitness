import express, { RequestHandler } from 'express';
import {
  UpsertWaterIntakeBodySchema,
  UpdateWaterIntakeBodySchema,
  DateParamSchema,
  UuidParamSchema,
} from '../../schemas/measurementSchemas';

const checkPermissionMiddleware = require('../../middleware/checkPermissionMiddleware');
const onBehalfOfMiddleware = require('../../middleware/onBehalfOfMiddleware');
const measurementService = require('../../services/measurementService');

const router = express.Router();

router.use(checkPermissionMiddleware('checkin'));
router.use(onBehalfOfMiddleware);

/**
 * @swagger
 * /v2/measurements/water-intake/entry/{id}:
 *   get:
 *     summary: Get a water intake entry by ID
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-on-behalf-of-user-id
 *         schema:
 *           type: string
 *         description: Target user ID for family access.
 *     responses:
 *       200:
 *         description: Water intake entry.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Water intake entry not found.
 */
const getWaterIntakeEntryHandler: RequestHandler = async (req, res, next) => {
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
    const entry = await measurementService.getWaterIntakeEntryById(
      req.userId,
      id
    );
    res.status(200).json(entry);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('Forbidden')) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error.message === 'Water intake entry not found.') {
        res.status(404).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
};

/**
 * @swagger
 * /v2/measurements/water-intake/{date}:
 *   get:
 *     summary: Get water intake for a date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format.
 *       - in: header
 *         name: x-on-behalf-of-user-id
 *         schema:
 *           type: string
 *         description: Target user ID for family access.
 *     responses:
 *       200:
 *         description: Water intake data for the date.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 */
const getWaterIntakeHandler: RequestHandler = async (req, res, next) => {
  try {
    const paramResult = DateParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: paramResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { date } = paramResult.data;
    const waterData = await measurementService.getWaterIntake(
      req.userId,
      req.userId,
      date
    );
    res.status(200).json(waterData);
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * @swagger
 * /v2/measurements/water-intake:
 *   post:
 *     summary: Upsert a water intake entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: header
 *         name: x-on-behalf-of-user-id
 *         schema:
 *           type: string
 *         description: Target user ID for family access.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entry_date, change_drinks]
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               change_drinks:
 *                 type: number
 *               container_id:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Water intake entry upserted successfully.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 */
const upsertWaterIntakeHandler: RequestHandler = async (req, res, next) => {
  try {
    const bodyResult = UpsertWaterIntakeBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: bodyResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { entry_date, change_drinks, container_id } = bodyResult.data;
    const result = await measurementService.upsertWaterIntake(
      req.userId,
      req.originalUserId || req.userId,
      entry_date,
      change_drinks,
      container_id
    );
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      res.status(403).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * @swagger
 * /v2/measurements/water-intake/{id}:
 *   put:
 *     summary: Update a water intake entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-on-behalf-of-user-id
 *         schema:
 *           type: string
 *         description: Target user ID for family access.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               water_ml:
 *                 type: number
 *               entry_date:
 *                 type: string
 *                 format: date
 *               source:
 *                 type: string
 *     responses:
 *       200:
 *         description: Water intake entry updated successfully.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Water intake entry not found.
 */
const updateWaterIntakeHandler: RequestHandler = async (req, res, next) => {
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

    const bodyResult = UpdateWaterIntakeBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: bodyResult.error.flatten().fieldErrors,
      });
      return;
    }

    const updatedEntry = await measurementService.updateWaterIntake(
      req.userId,
      id,
      bodyResult.data
    );
    res.status(200).json(updatedEntry);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('Forbidden')) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (
        error.message === 'Water intake entry not found.' ||
        error.message ===
          'Water intake entry not found or not authorized to update.'
      ) {
        res.status(404).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
};

/**
 * @swagger
 * /v2/measurements/water-intake/{id}:
 *   delete:
 *     summary: Delete a water intake entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: x-on-behalf-of-user-id
 *         schema:
 *           type: string
 *         description: Target user ID for family access.
 *     responses:
 *       200:
 *         description: Water intake entry deleted successfully.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Water intake entry not found.
 */
const deleteWaterIntakeHandler: RequestHandler = async (req, res, next) => {
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
    const result = await measurementService.deleteWaterIntake(req.userId, id);
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('Forbidden')) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (
        error.message === 'Water intake entry not found.' ||
        error.message ===
          'Water intake entry not found or not authorized to delete.'
      ) {
        res.status(404).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
};

// Note: /entry/:id must be registered before /:date to avoid Express matching
// "entry" as a date parameter.
router.get('/water-intake/entry/:id', getWaterIntakeEntryHandler);
router.get('/water-intake/:date', getWaterIntakeHandler);
router.post('/water-intake', upsertWaterIntakeHandler);
router.put('/water-intake/:id', updateWaterIntakeHandler);
router.delete('/water-intake/:id', deleteWaterIntakeHandler);

export default router;
