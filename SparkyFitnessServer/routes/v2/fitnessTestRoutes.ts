import express from 'express';
import { z } from 'zod';
import { createFitnessTestBodySchema } from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  createFitnessTest,
  deleteFitnessTest,
  getLatestFitnessTest,
  InvalidFitnessTestError,
  listFitnessTests,
  UnknownExerciseEntryError,
} from '../../models/fitnessTestRepository.js';

/**
 * A person's running fitness tests (5K time trial, 30-minute all-out run,
 * Cooper test) and the training paces each gave. Owner-only: training data is
 * personal, so a delegated context is refused outright. The body carries only
 * the measurements; the result and paces are worked out here from the shared
 * rules.
 */
const router = express.Router();

router.use(requireSelfActor);

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * @swagger
 * /v2/fitness-tests:
 *   get:
 *     summary: List fitness tests
 *     description: Returns the person's running fitness tests, newest first, each with the training paces it gave.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ tests: [...] }`'
 *   post:
 *     summary: Save a fitness test
 *     description: Takes the measurements of a test, works out the result and training paces, and saves them. A test for an activity that already has one is replaced.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The saved test.
 *       400:
 *         description: Invalid body, or measurements that do not make a believable test.
 *       404:
 *         description: The named activity is not the person's.
 */
router.get('/', async (req, res, next) => {
  try {
    const tests = await listFitnessTests(req.userId, req.authenticatedUserId);
    res.json({ tests });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createFitnessTestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const test = await createFitnessTest(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.json(test);
  } catch (error) {
    if (error instanceof InvalidFitnessTestError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof UnknownExerciseEntryError) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/fitness-tests/latest:
 *   get:
 *     summary: Get the latest fitness test
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ test: {...} }`, or `{ test: null }` before the first test.'
 */
router.get('/latest', async (req, res, next) => {
  try {
    const test = await getLatestFitnessTest(
      req.userId,
      req.authenticatedUserId
    );
    res.json({ test });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/fitness-tests/{id}:
 *   delete:
 *     summary: Delete a fitness test
 *     tags: [Exercise]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: No such test.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ error: 'Invalid test id' });
    }
    const removed = await deleteFitnessTest(
      req.userId,
      params.data.id,
      req.authenticatedUserId
    );
    if (!removed) return res.status(404).json({ error: 'Test not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
