import express, { RequestHandler } from 'express';
import { z } from 'zod';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import { getActiveCaffeineKinetics } from '../../services/caffeineKineticsService.js';
import { getBloodAlcoholEstimate } from '../../services/bloodAlcoholService.js';
import { isDayString } from '@workspace/shared';

const router = express.Router();

router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

const DayQuerySchema = z.object({
  date: z.string().refine(isDayString, {
    message: 'Date must be in YYYY-MM-DD format',
  }),
});

const CaffeineActiveQuerySchema = DayQuerySchema.extend({
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

// Owner-only: alcohol data is sensitive, and a diary delegate could not read
// the weight and height the estimate needs anyway.
const requireSelfForBloodAlcohol = createRequireSelfActor({
  action: 'reading the blood alcohol estimate',
  message:
    'Forbidden: the blood alcohol estimate is only available for your own account.',
});

/**
 * @swagger
 * /v2/nutrition/blood-alcohol:
 *   get:
 *     summary: Get the estimated blood alcohol curve for a day
 *     description: >
 *       A rough Widmark estimate from the logged drinks and the profile (sex,
 *       weight, height, age). It can differ from the real value by 20% or more
 *       and must never be used to judge whether someone is fit to drive.
 *       Owner-only.
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
 *     responses:
 *       200:
 *         description: >
 *           Estimated blood alcohol response. status is missing_inputs (with
 *           missing_inputs listing what the profile lacks) or
 *           implausible_inputs when there is no estimate.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Refused for a switched or delegated context.
 */
const getBloodAlcoholHandler: RequestHandler = async (req, res, next) => {
  try {
    const queryResult = DayQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation error',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await getBloodAlcoholEstimate(req.userId, {
      date: queryResult.data.date,
    });
    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
};

router.get(
  '/blood-alcohol',
  requireSelfForBloodAlcohol,
  getBloodAlcoholHandler
);

export default router;
