import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import syncedDataService from '../services/syncedDataService.js';
import { isUserOriginatedSource } from '../models/syncedDataRepository.js';
import { log } from '../config/logging.js';

const router = express.Router();
router.use(express.json());

// A provider source tag such as 'garmin', 'healthkit', or 'health_connect'.
// The DB column is varchar(50); reject user-created sources (manual / workout
// preset / workout plan) here as an early guard — the service and repository
// refuse them too — since they represent data the user made themselves.
const sourceParamSchema = z.object({
  source: z
    .string()
    .trim()
    .min(1, 'source is required')
    .max(50, 'source is too long')
    .refine((s) => !isUserOriginatedSource(s), {
      message: 'User-created data cannot be bulk-deleted here.',
    }),
});

/**
 * @swagger
 * tags:
 *   name: Synced Data
 *   description: Self-service cleanup of provider-synced entry data.
 */

/**
 * @swagger
 * /synced-data/sources:
 *   get:
 *     summary: List the current user's synced data sources with row counts
 *     tags: [Synced Data]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An array of sources with per-table counts.
 *       500:
 *         description: Failed to load synced sources.
 */
router.get('/sources', authenticate, async (req, res, next) => {
  try {
    const sources = await syncedDataService.getSyncedSources(req.userId);
    res.status(200).json(sources);
  } catch (error) {
    log('error', `Error listing synced sources for user ${req.userId}:`, error);
    next(error);
  }
});

/**
 * @swagger
 * /synced-data/sources/{source}:
 *   delete:
 *     summary: Delete all of the current user's synced entries for one source
 *     tags: [Synced Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: source
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider source tag (e.g. "garmin", "healthkit").
 *     responses:
 *       200:
 *         description: Deletion succeeded; returns per-table counts.
 *       400:
 *         description: Invalid or disallowed source.
 *       500:
 *         description: Failed to delete synced data.
 */
router.delete('/sources/:source', authenticate, async (req, res, next) => {
  const parsed = sourceParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message });
  }
  try {
    const result = await syncedDataService.deleteSyncedSource(
      req.userId,
      parsed.data.source
    );
    res.status(200).json({
      message: `Deleted ${result.totalDeleted} synced entries for source '${parsed.data.source}'.`,
      ...result,
    });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message && error.message.includes('cannot be bulk-deleted')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(400).json({ error: error.message });
    }
    log(
      'error',
      `Error deleting synced source '${parsed.data.source}' for user ${req.userId}:`,
      error
    );
    next(error);
  }
});

export default router;
