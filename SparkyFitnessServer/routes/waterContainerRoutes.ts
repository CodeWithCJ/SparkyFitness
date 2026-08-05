import express from 'express';
import { z } from 'zod/v4';
import { authenticate } from '../middleware/authMiddleware.js';
import waterContainerService from '../services/waterContainerService.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import {
  WaterContainerIdParamSchema,
  CreateWaterContainerBodySchema,
  UpdateWaterContainerBodySchema,
} from '../schemas/waterContainerSchemas.js';
const router = express.Router();

// Small helper to send a uniform 400 for Zod failures.
function badRequest(res: express.Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'Invalid request',
    details: error.flatten().fieldErrors,
  });
}
/**
 * @swagger
 * /water-containers:
 *   post:
 *     summary: Create a new water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WaterContainer'
 *     responses:
 *       201:
 *         description: Water container created successfully.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const body = CreateWaterContainerBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const container = await waterContainerService.createWaterContainer(
      req.userId,
      body.data
    );
    res.status(201).json(container);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /water-containers:
 *   get:
 *     summary: Get all water containers for the user
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of water containers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WaterContainer'
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.query;

    const targetUserId = userId || req.userId;

    if (targetUserId !== req.userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        targetUserId,
        'diary',

        req.userId
      ); // Assuming diary permission allows viewing containers
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    const containers =
      await waterContainerService.getWaterContainersByUserId(targetUserId);
    res.status(200).json(containers);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /water-containers/{id}:
 *   put:
 *     summary: Update a water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WaterContainer'
 *     responses:
 *       200:
 *         description: Water container updated successfully.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const params = WaterContainerIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const body = UpdateWaterContainerBodySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const container = await waterContainerService.updateWaterContainer(
      params.data.id,
      req.userId,
      body.data
    );
    if (!container) {
      return res
        .status(404)
        .json({ error: 'Container not found or not authorized.' });
    }
    res.status(200).json(container);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /water-containers/{id}:
 *   delete:
 *     summary: Delete a water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted successfully.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const params = WaterContainerIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const result = await waterContainerService.deleteWaterContainer(
      params.data.id,
      req.userId
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.includes('not found')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /water-containers/{id}/set-primary:
 *   put:
 *     summary: Set a water container as primary
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Primary container set successfully.
 */
router.put('/:id/set-primary', authenticate, async (req, res, next) => {
  try {
    const params = WaterContainerIdParamSchema.safeParse(req.params);
    if (!params.success) return badRequest(res, params.error);
    const container = await waterContainerService.setPrimaryWaterContainer(
      params.data.id,
      req.userId
    );
    if (!container) {
      return res
        .status(404)
        .json({ error: 'Container not found or not authorized.' });
    }
    res.status(200).json(container);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /water-containers/primary:
 *   get:
 *     summary: Get the primary water container for the user
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The primary water container.
 */
router.get('/primary', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.query;

    const targetUserId = userId || req.userId;

    if (targetUserId !== req.userId) {
      const hasPermission = await { canAccessUserData }.canAccessUserData(
        targetUserId,
        'diary',

        req.userId
      );
      if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    }
    const primaryContainer =
      await waterContainerService.getPrimaryWaterContainerByUserId(
        targetUserId
      );
    if (primaryContainer) {
      res.status(200).json(primaryContainer);
    } else {
      // Return a default container if no primary is found
      res.status(200).json({
        id: null, // Indicate no actual container ID
        user_id: targetUserId,
        name: 'Default Container',
        volume: 2000, // Default to 2000ml
        unit: 'ml',
        is_primary: true,
        servings_per_container: 8, // Default to 8 servings
      });
    }
  } catch (error) {
    next(error);
  }
});
export default router;
