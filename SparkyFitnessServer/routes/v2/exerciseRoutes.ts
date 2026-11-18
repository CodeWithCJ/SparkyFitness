import express, { RequestHandler } from 'express';
import { z } from 'zod';
import {
  exerciseAlternativesQuerySchema,
  exerciseAlternativesResponseSchema,
  exerciseSearchQuerySchema,
  exerciseStatsBatchRequestSchema,
  exerciseStatsBatchResponseSchema,
  exerciseStatsQuerySchema,
  exerciseStatsResponseSchema,
  paginatedExercisesResponseSchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import exerciseService from '../../services/exerciseService.js';
import {
  ExerciseNotFoundError,
  getExerciseAlternatives,
} from '../../services/exerciseAlternativesService.js';
import { log } from '../../config/logging.js';

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /v2/exercises/search:
 *   get:
 *     summary: Paginated exercise library search
 *     tags: [Exercise & Workouts]
 *     description: Returns a paginated slice of the user's exercise library, ordered by name ASC. RLS scopes results to the caller.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Optional substring match against exercise name (ILIKE).
 *       - in: query
 *         name: equipmentFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of equipment to filter by.
 *       - in: query
 *         name: muscleGroupFilter
 *         schema:
 *           type: string
 *         description: Comma-separated list of muscle groups (primary or secondary).
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-based).
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page (max 100).
 *     responses:
 *       200:
 *         description: Paginated exercise library results.
 *       400:
 *         description: Invalid query parameters.
 *       401:
 *         description: Unauthenticated.
 *       500:
 *         description: Internal server error.
 */
const searchHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = exerciseSearchQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parsedQuery.error.flatten().fieldErrors,
      });
      return;
    }

    const { searchTerm, equipmentFilter, muscleGroupFilter, page, pageSize } =
      parsedQuery.data;

    const equipmentFilterArray = equipmentFilter
      ? equipmentFilter.split(',').filter(Boolean)
      : [];
    const muscleGroupFilterArray = muscleGroupFilter
      ? muscleGroupFilter.split(',').filter(Boolean)
      : [];
    const offset = (page - 1) * pageSize;

    const { exercises, totalCount } =
      await exerciseService.searchExercisesPaginated(
        req.userId,
        searchTerm,
        req.userId,
        equipmentFilterArray,
        muscleGroupFilterArray,
        pageSize,
        offset
      );

    const response = paginatedExercisesResponseSchema.parse({
      exercises,
      pagination: {
        page,
        pageSize,
        totalCount,
        hasMore: page * pageSize < totalCount,
      },
    });

    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 exercises search response validation failed:', error);
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

router.get('/search', searchHandler);

/**
 * @swagger
 * /v2/exercises/{exerciseId}/stats:
 *   get:
 *     summary: Per-exercise best set + last set stats + recent sessions
 *     tags: [Exercise & Workouts]
 *     description: |
 *       Returns the caller's all-time best set (heaviest weight; tie-broken by reps DESC, entry_date DESC, created_at DESC),
 *       most recent set (entry_date + created_at DESC, then highest set_number), and up to 3 most recent sessions
 *       (entry date + full set list, newest first) for a single exercise. Recent sessions include warmup sets;
 *       entries with no weight/reps-bearing sets (e.g. cardio) are skipped. Both set fields are null and
 *       recentSessions is empty when the user has no qualifying history. Scoped to req.userId.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Exercise UUID.
 *       - in: query
 *         name: excludePresetEntryId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: |
 *           Optional preset-entry UUID to exclude from the baseline. Used by the live active-workout card so today's
 *           in-progress (or pre-persisted planned) sets do not pollute the historical best/last baseline, and by the
 *           edit-workout screens to exclude the workout being edited. Also applies to recentSessions.
 *       - in: query
 *         name: presetId
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: |
 *           Optional workout preset id to scope recentSessions to. When supplied, only sessions performed as that
 *           preset are considered, so the live "Previous" placeholders reflect this preset's own history instead of
 *           this exercise's history from a different preset. Does not affect bestSet/lastSet, which stay
 *           exercise-global (a PR is a PR regardless of which preset it happened under).
 *     responses:
 *       200:
 *         description: Best set + last set stats + recent sessions.
 *       400:
 *         description: Invalid exerciseId, excludePresetEntryId (not a UUID), or presetId (not a positive integer).
 *       401:
 *         description: Unauthenticated.
 *       403:
 *         description: Forbidden (no diary permission when acting on behalf of another user).
 *       500:
 *         description: Internal server error.
 */
const statsHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = z
      .object({ exerciseId: z.string().uuid() })
      .safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid exerciseId',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const parsedQuery = exerciseStatsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: 'Invalid excludePresetEntryId or presetId',
        details: parsedQuery.error.flatten().fieldErrors,
      });
      return;
    }
    const stats = await exerciseService.getExerciseStats(
      req.userId,
      parsed.data.exerciseId,
      parsedQuery.data.excludePresetEntryId ?? null,
      parsedQuery.data.presetId ?? null
    );
    const response = exerciseStatsResponseSchema.parse(stats);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 exercises stats response validation failed:', error);
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

router.get(
  '/:exerciseId/stats',
  checkPermissionMiddleware('diary'),
  statsHandler
);

/**
 * @swagger
 * /v2/exercises/stats/batch:
 *   post:
 *     summary: Best / last / recent-session stats for many exercises at once
 *     tags: [Exercise & Workouts]
 *     description: |
 *       Answers the same question as `GET /v2/exercises/{exerciseId}/stats` for up to 100 exercise and preset pairs
 *       in one request, so a client preparing data for offline use does not send one request per exercise.
 *       `presetId` scopes `recentSessions` exactly as it does on the single endpoint. Read-only.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [exerciseId]
 *                   properties:
 *                     exerciseId:
 *                       type: string
 *                       format: uuid
 *                     presetId:
 *                       type: integer
 *                       minimum: 1
 *     responses:
 *       200:
 *         description: One stats item per requested pair, in request order.
 *       400:
 *         description: Invalid body (no items, more than 100 items, or a malformed id).
 *       401:
 *         description: Unauthenticated.
 *       403:
 *         description: Forbidden (no diary permission when acting on behalf of another user).
 *       500:
 *         description: Internal server error.
 */
const statsBatchHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = exerciseStatsBatchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid stats batch request',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const items = await exerciseService.getExerciseStatsBatch(
      req.userId,
      parsed.data.items
    );
    const response = exerciseStatsBatchResponseSchema.parse({ items });
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log(
        'error',
        'v2 exercises stats batch response validation failed:',
        error
      );
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

router.post(
  '/stats/batch',
  checkPermissionMiddleware('diary'),
  statsBatchHandler
);

/**
 * @swagger
 * /v2/exercises/{exerciseId}/alternatives:
 *   get:
 *     summary: Ranked alternatives for an exercise
 *     tags: [Exercise & Workouts]
 *     description: |
 *       Suggests substitutes for an exercise (busy equipment, injury, variety), drawn from the caller's visible
 *       library and, unless disabled, the Free Exercise DB catalog. Candidates must share a primary muscle and
 *       modality with the source. They are ranked by primary-muscle overlap, then matching equipment (in `similar`
 *       mode), movement pattern, and how recently the user performed them. Each result lists the reasons it was
 *       chosen. Catalog results (`origin: catalog`) must be imported with `POST /freeexercisedb/add` before logging.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [similar, different_equipment]
 *           default: similar
 *         description: "`different_equipment` only returns exercises that use none of the source's equipment."
 *       - in: query
 *         name: equipment
 *         schema:
 *           type: string
 *         description: Comma-separated equipment the user has; results need nothing else.
 *       - in: query
 *         name: excludeMuscles
 *         schema:
 *           type: string
 *         description: Comma-separated muscles to avoid (primary or secondary), e.g. for an injury.
 *       - in: query
 *         name: excludeIds
 *         schema:
 *           type: string
 *         description: Comma-separated library or catalog ids to leave out (e.g. exercises already in the workout).
 *       - in: query
 *         name: includeCatalog
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'true'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Ranked alternatives. `rankable` is false when the source has no recognisable primary muscle.
 *       400:
 *         description: Invalid exerciseId or query parameters.
 *       401:
 *         description: Unauthenticated.
 *       403:
 *         description: Forbidden (no diary permission when acting on behalf of another user).
 *       404:
 *         description: Exercise not found or not visible to the caller.
 *       500:
 *         description: Internal server error.
 */
const alternativesHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = z
      .object({ exerciseId: z.string().uuid() })
      .safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid exerciseId',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const parsedQuery = exerciseAlternativesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parsedQuery.error.flatten().fieldErrors,
      });
      return;
    }
    const {
      mode,
      equipment,
      excludeMuscles,
      excludeIds,
      includeCatalog,
      limit,
    } = parsedQuery.data;
    const result = await getExerciseAlternatives(
      req.userId,
      req.authenticatedUserId,
      parsed.data.exerciseId,
      { mode, equipment, excludeMuscles, excludeIds, includeCatalog, limit }
    );
    res.status(200).json(exerciseAlternativesResponseSchema.parse(result));
  } catch (error: unknown) {
    if (error instanceof ExerciseNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === 'ZodError') {
      log(
        'error',
        'v2 exercises alternatives response validation failed:',
        error
      );
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

router.get(
  '/:exerciseId/alternatives',
  checkPermissionMiddleware('diary'),
  alternativesHandler
);

module.exports = router;
