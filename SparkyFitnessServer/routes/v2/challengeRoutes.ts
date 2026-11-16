import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  challengeStandingsQuerySchema,
  createChallengeBodySchema,
  createChallengeInviteBodySchema,
  isDayString,
  joinChallengeBodySchema,
  updateChallengeRulesBodySchema,
} from '@workspace/shared';
import type { z } from 'zod';
import { authenticate } from '../../middleware/authMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import * as challengeService from '../../services/challengeService.js';

const router = express.Router();

// Joining is consent given by the person themselves, so nothing here can be
// done for someone else: a family delegate or a switched account gets 403.
const requireSelf = createRequireSelfActor({
  action: 'a challenge action',
  message: 'Forbidden: challenges are only available for your own account.',
});

/** The admin switch (Admin > Challenges). Off answers 403 for every route but /status. */
async function requireChallengesEnabled(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (await challengeService.challengesEnabled()) {
      next();
      return;
    }
    res.status(403).json({
      error: 'Challenges are turned off on this server',
      code: 'CHALLENGES_DISABLED',
    });
  } catch (error) {
    next(error);
  }
}

router.use(authenticate);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A malformed id can never name a challenge; answer as for any unknown one.
router.param('id', (_req, res, next, id: string) => {
  if (UUID_RE.test(id)) return next();
  res
    .status(404)
    .json({ error: 'Challenge not found', code: 'CHALLENGE_NOT_FOUND' });
});

/**
 * @swagger
 * /v2/challenges/status:
 *   get:
 *     summary: Whether Challenges is turned on for this server
 *     tags: [Challenges]
 *     responses:
 *       200: { description: "{ enabled: boolean }" }
 */
router.get('/status', async (_req, res, next) => {
  try {
    res.json({ enabled: await challengeService.challengesEnabled() });
  } catch (error) {
    next(error);
  }
});

router.use(requireSelf);
router.use(requireChallengesEnabled);

function invalid(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'Invalid request',
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

const me = (req: Request): string => req.userId;

/**
 * @swagger
 * /v2/challenges:
 *   get:
 *     summary: The challenges you are a member of
 *     tags: [Challenges]
 *     responses:
 *       200: { description: Challenge summaries }
 *       403: { description: Challenges are turned off, or a delegated context }
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await challengeService.listChallenges(me(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges:
 *   post:
 *     summary: Host a new challenge (from a preset or your own rules); you join it as host
 *     tags: [Challenges]
 *     responses:
 *       201: { description: The new challenge }
 *       400: { description: Invalid rules or dates }
 *       429: { description: Too many challenges made }
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = createChallengeBodySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    if (
      !isDayString(parsed.data.start_date) ||
      (parsed.data.end_date && !isDayString(parsed.data.end_date))
    ) {
      return res
        .status(400)
        .json({ error: 'start_date and end_date must be YYYY-MM-DD' });
    }
    res
      .status(201)
      .json(await challengeService.createChallenge(me(req), parsed.data));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/join:
 *   post:
 *     summary: Join a challenge with an invite code (rate limited)
 *     tags: [Challenges]
 *     responses:
 *       200: { description: The challenge joined }
 *       404: { description: The code is not valid or has expired }
 *       409: { description: The challenge is full, ended or closed to late joiners }
 *       429: { description: Too many attempts }
 */
router.post('/join', async (req, res, next) => {
  try {
    const parsed = joinChallengeBodySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    res.json(await challengeService.joinChallenge(me(req), parsed.data));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}:
 *   get:
 *     summary: One challenge you are a member of, with its members' display names
 *     tags: [Challenges]
 *     responses:
 *       200: { description: The challenge }
 *       404: { description: Not found, or you are not a member }
 */
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await challengeService.getChallenge(me(req), req.params.id));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}/rules:
 *   put:
 *     summary: Change the rules (host only). Before the start the change applies from the start, after it from the next period; every change is logged for members
 *     tags: [Challenges]
 *     responses:
 *       200: { description: The challenge with its new rules }
 *       403: { description: Only the host can change the rules }
 *       429: { description: Too many rules changes to this challenge }
 */
router.put('/:id/rules', async (req, res, next) => {
  try {
    const parsed = updateChallengeRulesBodySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    res.json(
      await challengeService.updateRules(
        me(req),
        req.params.id,
        parsed.data.rules
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}/rule-changes:
 *   get:
 *     summary: The log of rules changes, visible to every member
 *     tags: [Challenges]
 *     responses:
 *       200: { description: The changes, oldest first }
 */
router.get('/:id/rule-changes', async (req, res, next) => {
  try {
    res.json(await challengeService.getRuleChanges(me(req), req.params.id));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}/invite:
 *   post:
 *     summary: Make a new invite code (host only); replaces any live code. The code is returned only here
 *     tags: [Challenges]
 *     responses:
 *       201: { description: "{ code, expires_at }" }
 *       429: { description: Too many invite codes made }
 *   delete:
 *     summary: Revoke the invite code (host only)
 *     tags: [Challenges]
 *     responses:
 *       204: { description: Revoked }
 */
router.post('/:id/invite', async (req, res, next) => {
  try {
    const parsed = createChallengeInviteBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);
    res
      .status(201)
      .json(
        await challengeService.createInvite(
          me(req),
          req.params.id,
          parsed.data.expires_in_days
        )
      );
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/invite', async (req, res, next) => {
  try {
    await challengeService.revokeInvite(me(req), req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}/leave:
 *   post:
 *     summary: Leave a challenge; your scores in it are deleted. A leaving host passes hosting to the longest-standing member
 *     tags: [Challenges]
 *     responses:
 *       204: { description: Left }
 */
router.post('/:id/leave', async (req, res, next) => {
  try {
    await challengeService.leaveChallenge(me(req), req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/challenges/{id}/standings:
 *   get:
 *     summary: Standings of the period containing `date` (default today); final once the period is frozen
 *     tags: [Challenges]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: The standings }
 */
router.get('/:id/standings', async (req, res, next) => {
  try {
    const parsed = challengeStandingsQuerySchema.safeParse(req.query);
    if (
      !parsed.success ||
      (parsed.data.date && !isDayString(parsed.data.date))
    ) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    res.json(
      await challengeService.getStandings(
        me(req),
        req.params.id,
        parsed.data.date
      )
    );
  } catch (error) {
    next(error);
  }
});

export default router;
