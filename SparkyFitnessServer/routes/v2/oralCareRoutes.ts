import express from 'express';
import {
  createOralCareSessionBodySchema,
  isDayString,
  oralCareHistoryQuerySchema,
  oralCareSettingsSchema,
  updateOralCareSessionBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import * as oralCareService from '../../services/oralCareService.js';

const router = express.Router();

// The goal lives on user_preferences, which only the owner may write.
const requireOwnGoal = createRequireSelfActor({
  action: 'an oral care goal change',
  message: 'Forbidden: only the account owner can change the brushing goal.',
});

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('checkin'));

/** A partial update can leave the type/label pair or the times in a state only the table sees. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  chk_oral_care_sessions_custom_label:
    'custom_label is required for care_type other and not allowed otherwise',
  chk_oral_care_sessions_time_order: 'end_time must not be before start_time',
};

function constraintMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, constraint } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  if (code === '22P02') return 'Invalid session ID';
  if (code !== '23514' || typeof constraint !== 'string') return null;
  return CONSTRAINT_MESSAGES[constraint] ?? null;
}

function actors(req: express.Request): {
  userId: string;
  actingUserId: string;
} {
  const userId = req.userId;
  return { userId, actingUserId: req.authenticatedUserId || userId };
}

/**
 * @swagger
 * /v2/oral-care/day-summary:
 *   get:
 *     summary: One day's oral care sessions, counted totals, goal and current streak
 *     tags: [Check-In]
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: The day summary }
 *       400: { description: Invalid date }
 */
router.get('/day-summary', async (req, res, next) => {
  try {
    const date = String(req.query.date ?? '');
    if (!isDayString(date)) {
      return res
        .status(400)
        .json({ error: 'date query parameter must be YYYY-MM-DD' });
    }
    const { userId, actingUserId } = actors(req);
    res.json(await oralCareService.getDaySummary(userId, actingUserId, date));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/history:
 *   get:
 *     summary: Per-day counted brushing totals for a range (up to 366 days), the streaks and recent custom names
 *     tags: [Check-In]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: The history }
 *       400: { description: Invalid range }
 */
router.get('/history', async (req, res, next) => {
  try {
    const parsed = oralCareHistoryQuerySchema.safeParse(req.query);
    if (
      !parsed.success ||
      !isDayString(parsed.data.startDate) ||
      !isDayString(parsed.data.endDate)
    ) {
      return res
        .status(400)
        .json({ error: 'startDate and endDate must be YYYY-MM-DD' });
    }
    const { startDate, endDate } = parsed.data;
    const days =
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (days < 1 || days > oralCareService.MAX_HISTORY_DAYS) {
      return res.status(400).json({
        error: `The range must run forward and cover at most ${oralCareService.MAX_HISTORY_DAYS} days`,
      });
    }
    const { userId, actingUserId } = actors(req);
    res.json(
      await oralCareService.getHistory(userId, actingUserId, startDate, endDate)
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/entries:
 *   get:
 *     summary: Oral care sessions of one day or a range, each flagged when a synced brush already records it
 *     tags: [Check-In]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: The sessions }
 *       400: { description: Invalid date or range }
 */
router.get('/entries', async (req, res, next) => {
  try {
    const date = req.query.date ? String(req.query.date) : null;
    const startDate =
      date ?? (req.query.startDate ? String(req.query.startDate) : '');
    const endDate =
      date ?? (req.query.endDate ? String(req.query.endDate) : '');
    if (
      !isDayString(startDate) ||
      !isDayString(endDate) ||
      startDate > endDate
    ) {
      return res.status(400).json({
        error: 'Send date, or startDate and endDate, as YYYY-MM-DD',
      });
    }
    const { userId, actingUserId } = actors(req);
    res.json(
      await oralCareService.getSessions(
        userId,
        actingUserId,
        startDate,
        endDate
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/entries:
 *   post:
 *     summary: Log an oral care session (manual or from the brushing timer)
 *     tags: [Check-In]
 *     responses:
 *       201: { description: The saved session }
 *       400: { description: Invalid body }
 */
router.post('/entries', async (req, res, next) => {
  try {
    const parsed = createOralCareSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const { userId, actingUserId } = actors(req);
    res
      .status(201)
      .json(
        await oralCareService.createSession(userId, actingUserId, parsed.data)
      );
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return res.status(400).json({ error: message });
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/entries/{id}:
 *   put:
 *     summary: Change an oral care session; fields sent replace the stored ones
 *     tags: [Check-In]
 *     responses:
 *       200: { description: The updated session }
 *       400: { description: Invalid body }
 *       404: { description: Not found }
 */
router.put('/entries/:id', async (req, res, next) => {
  try {
    const parsed = updateOralCareSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const { userId, actingUserId } = actors(req);
    const updated = await oralCareService.updateSession(
      userId,
      actingUserId,
      req.params.id,
      parsed.data
    );
    if (!updated) {
      return res.status(404).json({ error: 'Oral care session not found' });
    }
    res.json(updated);
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return res.status(400).json({ error: message });
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/entries/{id}:
 *   delete:
 *     summary: Delete an oral care session
 *     tags: [Check-In]
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/entries/:id', async (req, res, next) => {
  try {
    const { userId, actingUserId } = actors(req);
    const deleted = await oralCareService.deleteSession(
      userId,
      actingUserId,
      req.params.id
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Oral care session not found' });
    }
    res.json({ success: true });
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return res.status(400).json({ error: message });
    next(error);
  }
});

/**
 * @swagger
 * /v2/oral-care/settings:
 *   get:
 *     summary: The brushing goal (brushes per day, target seconds per brush)
 *     tags: [Check-In]
 *     responses:
 *       200: { description: The goal }
 *   put:
 *     summary: Save the brushing goal (owner only)
 *     tags: [Check-In]
 *     responses:
 *       200: { description: The saved goal }
 *       400: { description: Invalid body }
 *       403: { description: Acting for another account }
 */
router.get('/settings', async (req, res, next) => {
  try {
    const { userId, actingUserId } = actors(req);
    res.json(await oralCareService.getSettings(userId, actingUserId));
  } catch (error) {
    next(error);
  }
});

router.put('/settings', requireOwnGoal, async (req, res, next) => {
  try {
    const parsed = oralCareSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    res.json(await oralCareService.saveSettings(req.userId, parsed.data));
  } catch (error) {
    next(error);
  }
});

export default router;
