import express, { RequestHandler } from 'express';
import {
  exerciseHistoryQuerySchema,
  exerciseHistoryResponseSchema,
  exerciseSessionResponseSchema,
} from '@workspace/shared';
import {
  getExerciseEntryHistory,
  getExerciseEntriesByDateV2,
} from '../../services/exerciseEntryHistoryService.js';
import { z } from 'zod';

import { log } from '../../config/logging.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { canAccessUserData } from '../../utils/permissionUtils.js';

const router = express.Router();

router.use(checkPermissionMiddleware('diary'));

/**
 * @swagger
 * /v2/exercise-entries/history:
 *   get:
 *     summary: Get paginated exercise entry history
 *     tags: [Fitness & Workouts]
 *     description: Returns paginated exercise sessions (preset groups and standalone entries) sorted by date descending.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of sessions per page (max 100)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID for family access
 *     responses:
 *       200:
 *         description: Paginated exercise history
 *       403:
 *         description: User does not have permission to access this resource
 *       500:
 *         description: Internal server error
 */
const historyHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = exerciseHistoryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parsedQuery.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, pageSize, userId: queryUserId } = parsedQuery.data;

    // Family access permission check
    const targetUserId = queryUserId || req.userId;

    const actorUserId = req.originalUserId || req.userId;

    if (queryUserId && queryUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        queryUserId,
        'diary',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const result = await getExerciseEntryHistory(targetUserId, page, pageSize);
    const response = exerciseHistoryResponseSchema.parse(result);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 exercise history response validation failed:', error);
      next(
        Object.assign(new Error('Internal response validation failed'), {
          status: 500,
        })
      );
      return;
    }
    next(error);
  }
};

router.get('/history', historyHandler);

/**
 * @swagger
 * /v2/exercise-entries/by-date:
 *   get:
 *     summary: Get exercise sessions for a specific date
 *     tags: [Fitness & Workouts]
 *     description: Returns exercise sessions (preset groups and standalone entries) for a given date with properly parsed exercise snapshots.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: selectedDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to retrieve exercise entries for (YYYY-MM-DD)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID for family access
 *     responses:
 *       200:
 *         description: Exercise sessions for the specified date
 *       400:
 *         description: Missing or invalid selectedDate parameter
 *       403:
 *         description: User does not have permission to access this resource
 *       500:
 *         description: Internal server error
 */
const byDateHandler: RequestHandler = async (req, res, next) => {
  try {
    const { selectedDate, userId: queryUserId } = req.query;

    if (!selectedDate || typeof selectedDate !== 'string') {
      res.status(400).json({ error: 'Selected date is required.' });
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(selectedDate)) {
      res
        .status(400)
        .json({ error: 'Selected date must be in YYYY-MM-DD format.' });
      return;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (queryUserId != null) {
      if (typeof queryUserId !== 'string' || !uuidRegex.test(queryUserId)) {
        res.status(400).json({ error: 'userId must be a valid UUID.' });
        return;
      }
    }

    const targetUserId = (queryUserId as string) || req.userId;
    const actorUserId = req.originalUserId || req.userId;

    if (queryUserId && queryUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        queryUserId,
        'diary',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const sessions = await getExerciseEntriesByDateV2(
      targetUserId,
      selectedDate
    );
    const response = z.array(exerciseSessionResponseSchema).parse(sessions);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 exercise by-date response validation failed:', error);
      next(
        Object.assign(new Error('Internal response validation failed'), {
          status: 500,
        })
      );
      return;
    }
    next(error);
  }
};

router.get('/by-date', byDateHandler);

module.exports = router;
