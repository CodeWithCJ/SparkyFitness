import express, { RequestHandler } from 'express';
import { z } from 'zod';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import alcoholWeekService from '../../services/alcoholWeekService.js';
import hydrationNutritionRangeService from '../../services/hydrationNutritionRangeService.js';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import compareService from '../../services/compareService.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import {
  CompareModeError,
  compareQuerySchema,
  compareSinceQuerySchema,
  isDayString,
  type CompareResponse,
  type CompareSinceResponse,
  type WorkoutDaysResponse,
} from '@workspace/shared';

const router = express.Router();

router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('reports'));

const AlcoholWeekQuerySchema = z.object({
  date: z.string().refine(isDayString, {
    message: 'Date must be in YYYY-MM-DD format',
  }),
});

// Same bound as dailySummaryRoutes.ts's /range: a year of chart is already
// more than any Trends view renders legibly, and it caps the zero-fill loop.
const HYDRATION_NUTRITION_MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;

const HydrationNutritionRangeQuerySchema = z
  .object({
    start: z.string().refine(isDayString, {
      message: 'start must be in YYYY-MM-DD format',
    }),
    end: z.string().refine(isDayString, {
      message: 'end must be in YYYY-MM-DD format',
    }),
  })
  .refine((q) => q.start <= q.end, {
    message: 'start must not be after end',
    path: ['start'],
  })
  .refine(
    (q) =>
      Math.round(
        (Date.parse(`${q.end}T00:00:00Z`) -
          Date.parse(`${q.start}T00:00:00Z`)) /
          MS_PER_DAY
      ) +
        1 <=
      HYDRATION_NUTRITION_MAX_RANGE_DAYS,
    {
      message: `Date range must not exceed ${HYDRATION_NUTRITION_MAX_RANGE_DAYS} days`,
      path: ['end'],
    }
  );

/**
 * @swagger
 * /v2/reports/alcohol-week:
 *   get:
 *     summary: Get weekly alcohol consumption rollup and limit progress
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Any date within the target week (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Weekly alcohol summary.
 *       400:
 *         description: Validation error.
 */
const getAlcoholWeekHandler: RequestHandler = async (req, res, next) => {
  try {
    const queryResult = AlcoholWeekQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { date } = queryResult.data;
    const result = await alcoholWeekService.getAlcoholWeek(req.userId, date);
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.get('/alcohol-week', getAlcoholWeekHandler);

/**
 * @swagger
 * /v2/reports/hydration-nutrition-range:
 *   get:
 *     summary: Get zero-padded daily hydration, caffeine and alcohol totals for a date range
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: One row per day in the range with water_ml, caffeine_mg and alcohol_g.
 *       400:
 *         description: Validation error.
 */
const getHydrationNutritionRangeHandler: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const queryResult = HydrationNutritionRangeQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { start, end } = queryResult.data;
    const result =
      await hydrationNutritionRangeService.getHydrationNutritionRange(
        req.userId,
        start,
        end
      );
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.get('/hydration-nutrition-range', getHydrationNutritionRangeHandler);

/**
 * @swagger
 * /v2/reports/workout-days:
 *   get:
 *     summary: Get per-day workout counts for the workout heatmap
 *     description: Only days with at least one logged workout are returned. Device "Active Calories" summary rows are not counted.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Days with workouts and their entry counts.
 *       400:
 *         description: Validation error (bad dates, or a range over 366 days).
 */
const getWorkoutDaysHandler: RequestHandler = async (req, res, next) => {
  try {
    // Same 366-day bounded day range as hydration-nutrition-range.
    const queryResult = HydrationNutritionRangeQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { start, end } = queryResult.data;
    const days = await exerciseEntryRepository.getWorkoutDayCounts(
      req.userId,
      start,
      end
    );
    const body: WorkoutDaysResponse = { days };
    res.status(200).json(body);
  } catch (error: unknown) {
    next(error);
  }
};

router.get('/workout-days', getWorkoutDaysHandler);

/**
 * @swagger
 * /v2/reports/compare:
 *   get:
 *     summary: Compare any two tracked things
 *     description: Does A go with B? Pairs the two over the range by day (or by week) and reports how strongly they move together. Only available for your own account.
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: a
 *         required: true
 *         schema:
 *           type: string
 *         description: First metric key.
 *       - in: query
 *         name: b
 *         required: true
 *         schema:
 *           type: string
 *         description: Second metric key (must differ from a).
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [day, week, since]
 *           default: day
 *         description: "`since` compares the outcome before and since a habit started (A is the habit, B the outcome)."
 *       - in: query
 *         name: timing
 *         schema:
 *           type: integer
 *           enum: [-1, 0, 1]
 *           default: 0
 *         description: Shift B against A by this many days (day mode only).
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date
 *         description: First day of the range. Required for day and week mode; not used in since mode.
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date
 *         description: Last day of the range. Required for day and week mode; not used in since mode.
 *       - in: query
 *         name: habitStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Since mode only, optional. The day the habit started (YYYY-MM-DD); must be before today and at most 730 days ago. When absent the server suggests one.
 *       - in: query
 *         name: line
 *         schema:
 *           type: number
 *         description: Since mode only, optional. The line for "share of days at or above", in the outcome's own scale. Defaults to a sensible line for the outcome.
 *     responses:
 *       200:
 *         description: The comparison result, or a not-enough-data answer. `through` (YYYY-MM-DD) is the last day included; today, or the current week in week mode, is left out until it is over. In since mode the answer has `mode` 'since', the habit and outcome raw values over the before and since stretches, and the result - suggested start, before and since stretches, the difference with its 95% range and p, typical range, share at or above the line, regularity, and an already-changing warning.
 *       400:
 *         description: Validation error (unknown metric, same metric twice, span over 180 days or 366 in week mode, metric not offered weekly; in since mode, a metric not offered in since mode (weight trend), habitStart not before today or more than 730 days ago).
 *       403:
 *         description: Called on behalf of another account.
 */
const getCompareHandler: RequestHandler = async (req, res, next) => {
  try {
    if (req.query.mode === 'since') {
      const sinceResult = compareSinceQuerySchema.safeParse(req.query);
      if (!sinceResult.success) {
        res.status(400).json({
          error: 'Validation error',
          details: sinceResult.error.flatten().fieldErrors,
        });
        return;
      }
      const sinceBody: CompareSinceResponse =
        await compareService.getCompareSince(req.userId, sinceResult.data);
      res.status(200).json(sinceBody);
      return;
    }
    const queryResult = compareQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }
    const body: CompareResponse = await compareService.getCompare(
      req.userId,
      queryResult.data
    );
    res.status(200).json(body);
  } catch (error: unknown) {
    // Only a question asked out of range is the caller's mistake: a metric in a mode it has no
    // form in, or a since start that is not before today or is older than the start limit.
    if (error instanceof CompareModeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
};

router.get('/compare', requireSelfActor, getCompareHandler);

export default router;
