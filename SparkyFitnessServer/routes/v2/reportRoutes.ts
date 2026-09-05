import express, { RequestHandler } from 'express';
import { z } from 'zod';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import alcoholWeekService from '../../services/alcoholWeekService.js';
import hydrationNutritionRangeService from '../../services/hydrationNutritionRangeService.js';
import { isDayString } from '@workspace/shared';

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

export default router;
module.exports = router;
