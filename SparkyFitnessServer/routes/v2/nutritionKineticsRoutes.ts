import express, { RequestHandler } from 'express';
import { z } from 'zod';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { getActiveCaffeineKinetics } from '../../services/caffeineKineticsService.js';
import { isDayString } from '@workspace/shared';

const router = express.Router();

router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

const CaffeineActiveQuerySchema = z.object({
  date: z.string().refine(isDayString, {
    message: 'Date must be in YYYY-MM-DD format',
  }),
  dose_mg: z.coerce.number().positive().optional(),
});

/**
 * @swagger
 * /v2/nutrition/caffeine/active:
 *   get:
 *     summary: Get active caffeine pharmacokinetics and bedtime curfew
 *     tags: [Nutrition]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Target calendar date (YYYY-MM-DD)
 *       - in: query
 *         name: dose_mg
 *         required: false
 *         schema:
 *           type: number
 *         description: Next planned dose size in mg for curfew calculation (default 200)
 *     responses:
 *       200:
 *         description: Active caffeine kinetics response.
 *       400:
 *         description: Validation error.
 */
const getCaffeineActiveHandler: RequestHandler = async (req, res, next) => {
  try {
    const queryResult = CaffeineActiveQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { date, dose_mg } = queryResult.data;
    const result = await getActiveCaffeineKinetics(req.userId, {
      date,
      doseMg: dose_mg,
    });
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.get('/caffeine/active', getCaffeineActiveHandler);

export default router;
module.exports = router;
