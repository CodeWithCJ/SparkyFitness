import express from 'express';
import {
  customRunProgramInputSchema,
  adjustRunning,
  adjustRunProgramBodySchema,
  completeRunProgramWorkoutBodySchema,
  findProgram,
  ProgramAdjustError,
  rateRunProgramWorkoutBodySchema,
  upsertRunProgramBodySchema,
} from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import {
  adjustRunProgram,
  completeRunProgramWorkout,
  createCustomRunProgram,
  CustomRunProgramLimitError,
  deleteCustomRunProgram,
  getRunProgram,
  InvalidRunProgramScheduleError,
  listCustomRunPrograms,
  rateRunProgramWorkout,
  UnknownRunProgramError,
  updateCustomRunProgram,
  upsertRunProgram,
} from '../../models/runProgramRepository.js';

/**
 * A person's run program and their place in it. Owner-only: a training plan is
 * personal, so a delegated context is refused outright. The program itself is
 * seeded from the built-in definitions in `@workspace/shared`; the stored copy
 * is what the person (and the AI assistant) can adjust.
 */
const router = express.Router();

router.use(requireSelfActor);

/**
 * @swagger
 * /v2/run-program:
 *   get:
 *     summary: Get the run program
 *     description: Returns the person's run program and place in it, or null.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: 'The program, or `{ program: null }`.'
 *   put:
 *     summary: Start, switch on or off, or move within the run program
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The updated program.
 *       400:
 *         description: Invalid body or unknown program.
 */
router.get('/', async (req, res, next) => {
  try {
    const program = await getRunProgram(req.userId, req.authenticatedUserId);
    res.json({ program });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = upsertRunProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const program = await upsertRunProgram(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.json({ program });
  } catch (error) {
    if (error instanceof UnknownRunProgramError) {
      return res.status(400).json({ error: 'Unknown run program' });
    }
    if (error instanceof InvalidRunProgramScheduleError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/run-program/complete:
 *   post:
 *     summary: Mark a run program workout done
 *     description: Moves on only if `index` is the workout that was due, so a repeated request changes nothing. An optional `entry_id` records which diary entry the workout was done as.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The program, unchanged if `index` was not the due workout.
 */
router.post('/complete', async (req, res, next) => {
  try {
    const parsed = completeRunProgramWorkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    await completeRunProgramWorkout(
      req.userId,
      parsed.data.index,
      req.authenticatedUserId,
      {
        programId: parsed.data.program_id,
        day: parsed.data.day,
        entryId: parsed.data.entry_id,
      }
    );
    const program = await getRunProgram(req.userId, req.authenticatedUserId);
    res.json({ program });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/run-program/effort:
 *   post:
 *     summary: Rate how hard a finished run program workout felt
 *     description: Records a 1 to 10 rating for a workout that is already done, replacing an earlier rating of the same workout. A workout not yet done, or from another program, changes nothing.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The program, unchanged if the workout could not be rated.
 */
router.post('/effort', async (req, res, next) => {
  try {
    const parsed = rateRunProgramWorkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    await rateRunProgramWorkout(
      req.userId,
      parsed.data.index,
      parsed.data.rating,
      req.authenticatedUserId,
      parsed.data.program_id
    );
    const program = await getRunProgram(req.userId, req.authenticatedUserId);
    res.json({ program });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/run-program/adjust:
 *   post:
 *     summary: Ease or lengthen the running in the next workouts
 *     description: Changes only workouts not yet done, within 30% under and 10% over the original plan.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The updated program.
 *       400:
 *         description: Invalid body, no program, or nothing to change.
 */
router.post('/adjust', async (req, res, next) => {
  try {
    const parsed = adjustRunProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const program = await adjustRunProgram(
      req.userId,
      'user',
      (state) =>
        adjustRunning(
          state,
          parsed.data.percent,
          parsed.data.count,
          findProgram(state.programId)?.workouts
        ),
      req.authenticatedUserId
    );
    if (!program) {
      return res.status(400).json({ error: 'There is no run program.' });
    }
    res.json({ program });
  } catch (error) {
    if (error instanceof ProgramAdjustError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/run-program/custom:
 *   get:
 *     summary: List the person's own run programs
 *     description: Programs the person built themselves, a free list of workouts each. Start one with `PUT /v2/run-program` and `program_id` `custom:<id>`.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: `{ programs: [...] }`, newest first.
 *   post:
 *     summary: Create one of the person's own run programs
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The new program.
 *       400:
 *         description: Invalid body, or the most programs a person can keep.
 */
router.get('/custom', async (req, res, next) => {
  try {
    const programs = await listCustomRunPrograms(
      req.userId,
      req.authenticatedUserId
    );
    res.json({ programs });
  } catch (error) {
    next(error);
  }
});

router.post('/custom', async (req, res, next) => {
  try {
    const parsed = customRunProgramInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const program = await createCustomRunProgram(
      req.userId,
      parsed.data,
      req.authenticatedUserId
    );
    res.json({ program });
  } catch (error) {
    if (error instanceof CustomRunProgramLimitError) {
      return res
        .status(400)
        .json({ error: 'You have the most programs you can keep' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/run-program/custom/{id}:
 *   put:
 *     summary: Change one of the person's own run programs
 *     description: Replaces its name, activity and workouts. If it is the program being run, that copy changes too and the place is kept.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: The program.
 *       404:
 *         description: No such program.
 *   delete:
 *     summary: Delete one of the person's own run programs
 *     description: A copy being run is kept.
 *     tags: [Exercise]
 *     responses:
 *       204:
 *         description: Deleted.
 *       404:
 *         description: No such program.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.put('/custom/:id', async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'Program not found' });
    }
    const parsed = customRunProgramInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const program = await updateCustomRunProgram(
      req.userId,
      req.params.id,
      parsed.data,
      req.authenticatedUserId
    );
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ program });
  } catch (error) {
    next(error);
  }
});

router.delete('/custom/:id', async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'Program not found' });
    }
    const deleted = await deleteCustomRunProgram(
      req.userId,
      req.params.id,
      req.authenticatedUserId
    );
    if (!deleted) return res.status(404).json({ error: 'Program not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
