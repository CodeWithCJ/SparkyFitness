import express from 'express';
import { updateHeartRateZonesBodySchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import heartRateZoneService from '../../services/heartRateZoneService.js';

/**
 * A person's heart rate zone settings (max and resting heart rate, zone
 * method, custom floors) and the zones they produce. Owner-only: the settings
 * live on the owner's `user_preferences` row, whose RLS lets delegates read the
 * row but not change it, and this route goes further and refuses a delegated
 * context for both reads and writes.
 */
const router = express.Router();

router.use(authenticate);
router.use(requireSelfActor);

/**
 * @swagger
 * /v2/heart-rate-zones:
 *   get:
 *     summary: Get heart rate zone settings
 *     description: Returns the saved settings and the five zones (with bpm ranges) they produce, plus where the max heart rate came from.
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Settings and resolved zones.
 *   put:
 *     summary: Update heart rate zone settings
 *     description: Applies to workouts stored from now on and to what the app shows; stored time in zone is not recomputed. Send `reset` to return to the defaults.
 *     tags: [Fitness & Workouts]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Updated settings and resolved zones.
 *       400:
 *         description: Invalid settings.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(
      await heartRateZoneService.getHeartRateZones(
        req.userId,
        req.authenticatedUserId
      )
    );
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  const parsed = updateHeartRateZonesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid heart rate zone settings.',
      details: parsed.error.flatten(),
    });
  }
  try {
    res.json(
      await heartRateZoneService.updateHeartRateZones(
        req.userId,
        req.authenticatedUserId,
        parsed.data
      )
    );
  } catch (error) {
    next(error);
  }
});

export default router;
