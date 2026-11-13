import express from 'express';
import {
  customRunProgramInputSchema,
  adjustRunning,
  adjustRunProgramBodySchema,
  applyRealign,
  builtInBaseline,
  completeRunProgramWorkoutBodySchema,
  instantToDay,
  ProgramAdjustError,
  ProgramRealignStaleError,
  rateRunProgramWorkoutBodySchema,
  realignInputFromProgram,
  realignProgram,
  realignRunProgramBodySchema,
  todayInZone,
  toRealignResult,
  type RunProgramResponse,
  upsertRunProgramBodySchema,
} from '@workspace/shared';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
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
          builtInBaseline(state.programId, state.workouts)
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
 * /v2/run-program/realign:
 *   post:
 *     summary: Rebuild the rest of the plan to finish on the goal day
 *     description: Works out which workouts to drop, fold or repeat so the last one (the race) lands on the goal day, never touching the taper or the final workout, and eases the running after a long gap. Without `confirmed` true nothing is saved and the response only previews the change. A goal that is not realistic is reported with the choices (a later date, a shorter race, or `force` to go ahead); a `token` from the preview that no longer matches the plan is refused with 409.
 *     tags: [Exercise]
 *     responses:
 *       200:
 *         description: '`{ realign, applied, program }`.'
 *       400:
 *         description: Invalid body, no program, or nothing to realign.
 *       409:
 *         description: The plan changed since the preview was made.
 */
router.post('/realign', async (req, res, next) => {
  try {
    const parsed = realignRunProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const body = parsed.data;
    const tz = await loadUserTimezone(req.userId);
    const today = body.today ?? todayInZone(tz);
    const inputFor = (program: RunProgramResponse) => {
      const lastAdjusted = program.adjustment_log.at(-1);
      return realignInputFromProgram(program, {
        today,
        lastAdjustedDay: lastAdjusted
          ? instantToDay(lastAdjusted.at, tz)
          : null,
        distance: body.distance,
        force: body.force,
      });
    };
    if (body.confirmed !== true) {
      const program = await getRunProgram(req.userId, req.authenticatedUserId);
      if (!program) {
        return res.status(400).json({ error: 'There is no run program.' });
      }
      return res.json({
        realign: toRealignResult(realignProgram(inputFor(program))),
        applied: false,
        program: null,
      });
    }
    const program = await adjustRunProgram(
      req.userId,
      'user',
      (state) => applyRealign(inputFor(state.program), body.token),
      req.authenticatedUserId
    );
    if (!program) {
      return res.status(400).json({ error: 'There is no run program.' });
    }
    res.json({
      realign: toRealignResult(realignProgram(inputFor(program))),
      applied: true,
      program,
    });
  } catch (error) {
    if (error instanceof ProgramRealignStaleError) {
      return res.status(409).json({ error: error.message });
    }
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
 *         description: '`{ programs: [...] }`, newest first.'
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
