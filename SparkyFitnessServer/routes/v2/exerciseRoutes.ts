import express, { RequestHandler } from 'express';
import {
  exerciseSearchQuerySchema,
  paginatedExercisesResponseSchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import exerciseService from '../../services/exerciseService.js';
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

module.exports = router;
