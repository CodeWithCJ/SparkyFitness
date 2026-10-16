import express from 'express';
import {
  assignShoeBodySchema,
  createShoeBodySchema,
  shoeStatusSchema,
  updateShoeBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  assignShoeToExerciseEntry,
  createShoe,
  deleteShoe,
  getShoeById,
  getShoes,
  updateShoe,
} from '../../models/shoeRepository.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

/**
 * @swagger
 * /v2/shoes:
 *   get:
 *     summary: List running shoes
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, retired]
 *         description: Only return shoes with this status
 *     responses:
 *       200:
 *         description: Shoes with mileage derived from linked diary entries
 *       400:
 *         description: status is not active or retired
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/shoes?status=active|retired
router.get('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    let status;
    if (req.query.status !== undefined) {
      const parsed = shoeStatusSchema.safeParse(req.query.status);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'status must be active or retired' });
      }
      status = parsed.data;
    }
    const shoes = await getShoes(req.userId, authenticatedUserId, status);
    res.json(shoes);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shoes/assignments/{exerciseEntryId}:
 *   put:
 *     summary: Link a diary entry to a shoe, or clear the link
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseEntryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shoe_id]
 *             properties:
 *               shoe_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Shoe to link, or null to clear
 *     responses:
 *       200:
 *         description: The updated assignment
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Exercise entry or shoe not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/shoes/assignments/:exerciseEntryId  { shoe_id: string | null }
// Registered before /:id so "assignments" is never read as a shoe id.
router.put('/assignments/:exerciseEntryId', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = assignShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const assigned = await assignShoeToExerciseEntry(
      req.userId,
      req.params.exerciseEntryId,
      parsed.data.shoe_id,
      authenticatedUserId
    );
    if (!assigned) {
      return res
        .status(404)
        .json({ error: 'Exercise entry or shoe not found' });
    }
    res.json(assigned);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shoes/{id}:
 *   get:
 *     summary: Get one running shoe
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Shoe id
 *     responses:
 *       200:
 *         description: The shoe
 *       404:
 *         description: Shoe not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/shoes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const shoe = await getShoeById(
      req.userId,
      req.params.id,
      authenticatedUserId
    );
    if (!shoe) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json(shoe);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shoes:
 *   post:
 *     summary: Add a running shoe
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               brand: {type: string, nullable: true, maxLength: 120}
 *               model: {type: string, nullable: true, maxLength: 120}
 *               nickname: {type: string, nullable: true, maxLength: 120}
 *               purchase_date: {type: string, format: date, nullable: true}
 *               purchase_price: {type: number, minimum: 0, maximum: 99999999.99, nullable: true}
 *               starting_distance_km: {type: number, minimum: 0, maximum: 9999999.99}
 *               retirement_distance_km: {type: number, exclusiveMinimum: 0, maximum: 9999999.99}
 *               is_default: {type: boolean}
 *     responses:
 *       201:
 *         description: The created shoe
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/shoes
router.post('/', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = createShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const created = await createShoe(
      req.userId,
      parsed.data,
      authenticatedUserId
    );
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shoes/{id}:
 *   put:
 *     summary: Update, retire or reactivate a running shoe
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Shoe id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: {type: string, minLength: 1, maxLength: 120}
 *               brand: {type: string, nullable: true, maxLength: 120}
 *               model: {type: string, nullable: true, maxLength: 120}
 *               nickname: {type: string, nullable: true, maxLength: 120}
 *               purchase_date: {type: string, format: date, nullable: true}
 *               purchase_price: {type: number, minimum: 0, maximum: 99999999.99, nullable: true}
 *               starting_distance_km: {type: number, minimum: 0, maximum: 9999999.99}
 *               retirement_distance_km: {type: number, exclusiveMinimum: 0, maximum: 9999999.99}
 *               is_default: {type: boolean}
 *               status: {type: string, enum: [active, retired]}
 *     responses:
 *       200:
 *         description: The updated shoe
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Shoe not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/shoes/:id
router.put('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const parsed = updateShoeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const updated = await updateShoe(
      req.userId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shoes/{id}:
 *   delete:
 *     summary: Delete a running shoe
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Shoe id
 *     responses:
 *       200:
 *         description: Deleted; linked diary entries keep their data but lose the link
 *       404:
 *         description: Shoe not found
 *       403:
 *         description: Missing diary permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/shoes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const authenticatedUserId = req.authenticatedUserId || req.userId;
    const deleted = await deleteShoe(
      req.userId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Shoe not found' });
    }
    res.json({ success: true, message: 'Shoe deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
