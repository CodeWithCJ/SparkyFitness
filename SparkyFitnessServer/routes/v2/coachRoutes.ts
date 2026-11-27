import express from 'express';
import {
  answerNudgeBodySchema,
  createCustomCoachBodySchema,
  markCoachReadBodySchema,
  previewCoachDraftBodySchema,
  reactToNudgeBodySchema,
  updateCustomCoachBodySchema,
  updateBuiltinCoachBodySchema,
  updateCoachProfileBodySchema,
} from '@workspace/shared';
import requireSelfActor from '../../middleware/requireSelfMiddleware.js';
import coachService, {
  CoachAnswerError,
  CoachInvalidError,
  CoachLimitError,
  CoachNotFoundError,
} from '../../services/coachService.js';
import aiCoachRepository from '../../models/aiCoachRepository.js';
import {
  runCheckinNow,
  resetTodayCheckin,
} from '../../services/coachCheckinService.js';
import {
  applySuggestion,
  CoachSuggestionError,
  dismissSuggestion,
} from '../../services/coachSuggestionService.js';

/**
 * AI coaches (#2013): the person's "About me", check-in times, the coaches
 * they switched on and their unread messages. Owner-only: a delegated context
 * is refused, since coaches speak for the account owner.
 */
const router = express.Router();

router.use(requireSelfActor);

const invalid = (error: { format: () => unknown }) => ({
  error: 'Invalid request body',
  details: error.format(),
});

/** The answer a known coach error deserves; undefined for anything else. */
function knownError(
  error: unknown
): { status: number; body: Record<string, string> } | undefined {
  if (error instanceof CoachNotFoundError) {
    return { status: 404, body: { error: error.message } };
  }
  if (error instanceof CoachLimitError) {
    return { status: 409, body: { error: error.message, code: 'limit' } };
  }
  if (error instanceof CoachInvalidError) {
    return { status: 400, body: { error: error.message } };
  }
  if (error instanceof CoachAnswerError) {
    return {
      status: error.code === 'invalid' ? 400 : 409,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof CoachSuggestionError) {
    return {
      status: error.code === 'not_found' ? 404 : 409,
      body: { error: error.message, code: error.code },
    };
  }
  return undefined;
}

/**
 * @swagger
 * /v2/coaches:
 *   get:
 *     summary: Get the coach settings
 *     description: The shared About me profile and schedule, the person's allergens, whether an AI provider is set up, and every built-in coach with its rules and unread count.
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The coach settings.
 *       403:
 *         description: Not the account owner.
 * /v2/coaches/profile:
 *   put:
 *     summary: Update About me, check-in times, the daily limit or the pause
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The updated profile.
 *       400:
 *         description: Invalid body.
 * /v2/coaches/builtin/{key}:
 *   put:
 *     summary: Switch a built-in coach on or off and change its rules
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The coach.
 *       404:
 *         description: Unknown coach.
 * /v2/coaches/builtin/{key}/preview:
 *   post:
 *     summary: Would this coach speak right now
 *     description: Checks the coach's rules against today's data. Uses no AI and saves nothing.
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The result and the numbers behind it.
 *       404:
 *         description: Unknown coach.
 * /v2/coaches/unread:
 *   get:
 *     summary: Unread coach messages
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The total and the count per coach.
 * /v2/coaches/read:
 *   post:
 *     summary: Mark a coach's messages read
 *     tags: [AI & Insights]
 *     responses:
 *       200:
 *         description: The unread counts after marking.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await coachService.getCoachSettings(req.userId));
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const parsed = updateCoachProfileBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(await coachService.updateCoachProfile(req.userId, parsed.data));
  } catch (error) {
    next(error);
  }
});

router.put('/builtin/:key', async (req, res, next) => {
  try {
    const parsed = updateBuiltinCoachBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(
      await coachService.updateBuiltinCoach(
        req.userId,
        String(req.params.key),
        parsed.data
      )
    );
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/builtin/:key/preview', async (req, res, next) => {
  try {
    res.json(
      await coachService.previewBuiltinCoach(req.userId, String(req.params.key))
    );
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/check-in-now', async (req, res, next) => {
  try {
    res.json(await runCheckinNow(req.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/reset-today', async (req, res, next) => {
  try {
    res.json(await resetTodayCheckin(req.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/unread', async (req, res, next) => {
  try {
    res.json(await coachService.getUnread(req.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/read', async (req, res, next) => {
  try {
    const parsed = markCoachReadBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(
      await coachService.markThreadRead(req.userId, parsed.data.coach_id)
    );
  } catch (error) {
    next(error);
  }
});

router.post('/custom', async (req, res, next) => {
  try {
    const parsed = createCustomCoachBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res
      .status(201)
      .json(await coachService.createCustomCoach(req.userId, parsed.data));
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.patch('/custom/:id', async (req, res, next) => {
  try {
    const parsed = updateCustomCoachBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(
      await coachService.updateCustomCoach(
        req.userId,
        String(req.params.id),
        parsed.data
      )
    );
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.delete('/custom/:id', async (req, res, next) => {
  try {
    await coachService.deleteCustomCoach(req.userId, String(req.params.id));
    res.status(204).end();
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const parsed = previewCoachDraftBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(await coachService.previewDraft(req.userId, parsed.data));
  } catch (error) {
    next(error);
  }
});

router.get('/messages/unread', async (req, res, next) => {
  try {
    const since = new Date(String(req.query.since ?? ''));
    res.json(
      await aiCoachRepository.listUnreadMessages(
        req.userId,
        Number.isNaN(since.getTime()) ? null : since
      )
    );
  } catch (error) {
    next(error);
  }
});

router.get('/knowledge', async (req, res, next) => {
  try {
    res.json(await coachService.getKnowledge(req.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/:coachId/nudges', async (req, res, next) => {
  try {
    res.json(
      await aiCoachRepository.listNudgeStates(
        req.userId,
        String(req.params.coachId)
      )
    );
  } catch (error) {
    next(error);
  }
});

router.post('/nudges/:id/react', async (req, res, next) => {
  try {
    const parsed = reactToNudgeBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json(
      await coachService.reactToNudge(
        req.userId,
        String(req.params.id),
        parsed.data.reaction
      )
    );
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/nudges/:id/answer', async (req, res, next) => {
  try {
    const parsed = answerNudgeBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(invalid(parsed.error));
    res.json({
      answered: true,
      ...(await coachService.answerNudge(
        req.userId,
        String(req.params.id),
        parsed.data.value
      )),
    });
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/nudges/:id/apply', async (req, res, next) => {
  try {
    res.json(await applySuggestion(req.userId, String(req.params.id)));
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

router.post('/nudges/:id/dismiss', async (req, res, next) => {
  try {
    res.json(await dismissSuggestion(req.userId, String(req.params.id)));
  } catch (error) {
    const known = knownError(error);
    if (known) return res.status(known.status).json(known.body);
    next(error);
  }
});

export default router;
