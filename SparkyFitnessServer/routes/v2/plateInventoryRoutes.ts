import express from 'express';
import { savePlateInventoryBodySchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import {
  deletePlateInventory,
  getPlateInventory,
  savePlateInventory,
} from '../../models/plateInventoryRepository.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
// Plates and bars belong to the owner; a delegate gets a message about that,
// not the account-linking one.
router.use(
  createRequireSelfActor({
    action: 'a plate inventory request',
    message:
      'Forbidden: plates and bars are only available for your own account.',
  })
);

/**
 * @swagger
 * /v2/plate-inventory:
 *   get:
 *     summary: Get the bars and plates a person owns
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The saved inventory, or null in `inventory` until one is saved
 *       403:
 *         description: Not the owner of this inventory
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/plate-inventory
router.get('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const inventory = await getPlateInventory(req.userId, authenticatedUserId);
    res.json({ inventory });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/plate-inventory:
 *   put:
 *     summary: Save the bars and plates a person owns (creates or replaces)
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [weight_unit, bars, plates, collars_enabled, collar_weight]
 *             properties:
 *               weight_unit: {type: string, enum: [kg, lbs]}
 *               bars:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required: [id, name, kind, weight]
 *                   properties:
 *                     id: {type: string, minLength: 1, maxLength: 64}
 *                     name: {type: string, nullable: true, maxLength: 60}
 *                     kind: {type: string, enum: [barbell, womens, ez, trap, other]}
 *                     weight: {type: number, minimum: 0, maximum: 100}
 *               plates:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [weight, pairs]
 *                   properties:
 *                     weight: {type: number, minimum: 0.01, maximum: 100}
 *                     pairs: {type: integer, minimum: 0, maximum: 20}
 *               collars_enabled: {type: boolean}
 *               collar_weight: {type: number, minimum: 0, maximum: 100}
 *     responses:
 *       200:
 *         description: The saved inventory
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Not the owner of this inventory
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/plate-inventory
router.put('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = savePlateInventoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const saved = await savePlateInventory(
      req.userId,
      parsed.data,
      authenticatedUserId
    );
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/plate-inventory:
 *   delete:
 *     summary: Remove the saved inventory
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Removed; the next read returns a null inventory
 *       404:
 *         description: No inventory saved
 *       403:
 *         description: Not the owner of this inventory
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/plate-inventory
router.delete('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const deleted = await deletePlateInventory(req.userId, authenticatedUserId);
    if (!deleted) {
      return res.status(404).json({ error: 'Plate inventory not found' });
    }
    res.json({ success: true, message: 'Plate inventory removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
