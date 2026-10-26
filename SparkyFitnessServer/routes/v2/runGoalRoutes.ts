import express from 'express';
import { upsertRunGoalsBodySchema } from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  InvalidRunGoalsError,
  upsertRunGoals,
} from '../../models/runGoalRepository.js';
import { getRunGoalsWithProgress } from '../../services/runGoalService.js';

/**
 * A person's running goals: a weekly distance target and a race to count down
 * to. Owner-only, like the run program: a delegated context is refused.
 */
const router = express.Router();

router.use(requireSelfActor);

/**
 * @swagger
 * /v2/run-goals:
 *   get:
 *     summary: Get the running goals and progress
 *     description: Returns the weekly distance target and race, if set, with this week's running distance and the days to the race.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: "The goals and this week's progress; goals is null until one is set."
 *   put:
 *     summary: Set or clear running goals
 *     description: Only fields present are changed; null clears one. A race name or distance needs a race day.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The updated goals and progress.
 *       400:
 *         description: Invalid body.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(
      await getRunGoalsWithProgress(req.userId, req.authenticatedUserId)
    );
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = upsertRunGoalsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    await upsertRunGoals(req.userId, parsed.data, req.authenticatedUserId);
    res.json(
      await getRunGoalsWithProgress(req.userId, req.authenticatedUserId)
    );
  } catch (error) {
    if (error instanceof InvalidRunGoalsError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
