import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createLabMarkerBodySchema,
  createLabResultBodySchema,
  labResultListQuerySchema,
  updateLabMarkerBodySchema,
  updateLabResultBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  createLabMarker,
  createLabResult,
  deleteLabMarker,
  deleteLabResult,
  getLabResultById,
  listLabMarkers,
  listLabResults,
  listLatestLabResults,
  updateLabMarker,
  updateLabResult,
} from '../../models/labResultRepository.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

const uuidSchema = z.string().uuid();

const actingUsers = (req: Request) => ({
  targetUserId: req.userId,
  authenticatedUserId: req.authenticatedUserId || req.userId,
});

const invalidBody = (res: Response, error: z.ZodError) =>
  res
    .status(400)
    .json({ error: 'Invalid request body', details: error.format() });

/**
 * @swagger
 * /v2/lab-results/markers:
 *   get:
 *     summary: List the user's own lab markers
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Custom markers, A to Z
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LabMarker'
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/lab-results/markers
router.get('/markers', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    res.json(await listLabMarkers(targetUserId, authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/markers:
 *   post:
 *     summary: Create a lab marker
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LabMarkerInput'
 *     responses:
 *       201:
 *         description: The new marker
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LabMarker'
 *       400:
 *         description: Invalid body, or a low bound above the high bound
 *       409:
 *         description: A marker with this name already exists
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/lab-results/markers
router.post('/markers', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = createLabMarkerBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createLabMarker(
      targetUserId,
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
 * /v2/lab-results/markers/{id}:
 *   put:
 *     summary: Update a lab marker (send null to clear a bound)
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
 *         description: Marker id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LabMarkerUpdate'
 *     responses:
 *       200:
 *         description: The updated marker
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LabMarker'
 *       400:
 *         description: Invalid body, or a low bound above the high bound
 *       404:
 *         description: Marker not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/lab-results/markers/:id
router.put('/markers/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab marker not found' });
    }
    const parsed = updateLabMarkerBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateLabMarker(
      targetUserId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated)
      return res.status(404).json({ error: 'Lab marker not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/markers/{id}:
 *   delete:
 *     summary: Delete a lab marker and all of its results
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
 *         description: Marker id
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Marker not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/lab-results/markers/:id (also deletes the marker's results)
router.delete('/markers/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab marker not found' });
    }
    const deleted = await deleteLabMarker(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted)
      return res.status(404).json({ error: 'Lab marker not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/latest:
 *   get:
 *     summary: Newest result of every marker the user has results for
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: One result per marker
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LabResult'
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/lab-results/latest: the newest result of every marker
router.get('/latest', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    res.json(await listLatestLabResults(targetUserId, authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/entries:
 *   get:
 *     summary: List lab results, newest first
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: markerKey
 *         schema:
 *           type: string
 *         description: Built-in marker key such as hba1c (not with markerId)
 *       - in: query
 *         name: markerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Custom marker id (not with markerKey)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5000
 *           default: 1000
 *     responses:
 *       200:
 *         description: Results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LabResult'
 *       400:
 *         description: Invalid filter, or both markerKey and markerId
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/lab-results/entries?markerKey=|markerId=&startDate=&endDate=&limit=
router.get('/entries', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = labResultListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid query', details: parsed.error.format() });
    }
    res.json(
      await listLabResults(targetUserId, parsed.data, authenticatedUserId)
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/entries/{id}:
 *   get:
 *     summary: Get one lab result
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
 *         description: Result id
 *     responses:
 *       200:
 *         description: The result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LabResult'
 *       404:
 *         description: Result not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// GET /api/v2/lab-results/entries/:id
router.get('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const found = await getLabResultById(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!found) return res.status(404).json({ error: 'Lab result not found' });
    res.json(found);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/entries:
 *   post:
 *     summary: Add a lab result (several per marker per day are allowed)
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LabResultInput'
 *     responses:
 *       201:
 *         description: The new result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LabResult'
 *       400:
 *         description: Invalid body, an unknown marker, or a low bound above the high bound
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// POST /api/v2/lab-results/entries
router.post('/entries', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    const parsed = createLabResultBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const created = await createLabResult(
      targetUserId,
      parsed.data,
      authenticatedUserId
    );
    if (!created) {
      return res.status(400).json({ error: 'Unknown custom_marker_id' });
    }
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/entries/{id}:
 *   put:
 *     summary: Update a lab result's values (the marker cannot change)
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
 *         description: Result id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LabResultUpdate'
 *     responses:
 *       200:
 *         description: The updated result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LabResult'
 *       400:
 *         description: Invalid body, or a range or value the database rejects
 *       404:
 *         description: Result not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// PUT /api/v2/lab-results/entries/:id
router.put('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const parsed = updateLabResultBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidBody(res, parsed.error);
    const updated = await updateLabResult(
      targetUserId,
      req.params.id,
      parsed.data,
      authenticatedUserId
    );
    if (!updated)
      return res.status(404).json({ error: 'Lab result not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/lab-results/entries/{id}:
 *   delete:
 *     summary: Delete a lab result
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
 *         description: Result id
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Result not found
 *       403:
 *         description: Missing check-in permission
 *       500:
 *         description: Internal server error
 */
// DELETE /api/v2/lab-results/entries/:id
router.delete('/entries/:id', async (req, res, next) => {
  try {
    const { targetUserId, authenticatedUserId } = actingUsers(req);
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Lab result not found' });
    }
    const deleted = await deleteLabResult(
      targetUserId,
      req.params.id,
      authenticatedUserId
    );
    if (!deleted)
      return res.status(404).json({ error: 'Lab result not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
