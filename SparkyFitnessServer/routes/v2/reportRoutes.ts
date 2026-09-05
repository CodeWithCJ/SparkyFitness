import express, { RequestHandler } from 'express';
import { z } from 'zod';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import alcoholWeekService from '../../services/alcoholWeekService.js';
import { isDayString } from '@workspace/shared';

const router = express.Router();

router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('reports'));

const AlcoholWeekQuerySchema = z.object({
  date: z.string().refine(isDayString, {
    message: 'Date must be in YYYY-MM-DD format',
  }),
});

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

export default router;
module.exports = router;
