import express from 'express';
import { z } from 'zod';
import zeppBridgeService from '../integrations/zeppbridge/zeppBridgeService.js';
import { ZeppBridgeError } from '../integrations/zeppbridge/zeppBridgeClient.js';
import { log } from '../config/logging.js';
import { publicErrorMessage } from '../utils/errors.js';
import authMiddleware from '../middleware/authMiddleware.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  syncClaimTarget,
  startProviderSync,
} from '../services/providerSyncClaim.js';

const router = express.Router();

const MAX_DATE_RANGE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((val) => {
    // An impossible date such as 2026-13-01 is an Invalid Date, whose toISOString throws.
    const date = new Date(`${val}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(val);
  }, 'Invalid calendar date');

const providerIdSchema = z
  .string()
  .uuid('Invalid provider ID format')
  .optional();

const syncBodySchema = z
  .object({
    providerId: providerIdSchema,
    startDate: calendarDateSchema.nullable().optional(),
    endDate: calendarDateSchema.nullable().optional(),
  })
  .refine((d) => !d.startDate === !d.endDate, {
    message: 'startDate and endDate must be sent together',
    path: ['endDate'],
  })
  .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  })
  .refine(
    (d) =>
      !d.startDate ||
      !d.endDate ||
      Date.parse(d.endDate) - Date.parse(d.startDate) <=
        MAX_DATE_RANGE_DAYS * DAY_MS,
    {
      message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days.`,
      path: ['endDate'],
    }
  );

const providerBodySchema = z.object({ providerId: providerIdSchema });

function badRequest(res: express.Response, error: z.ZodError) {
  return res.status(400).json({
    message: 'Invalid request',
    error: error.issues[0]?.message || 'Validation failed',
    details: error.flatten(),
  });
}

/**
 * Maps a failure to a response. ZeppBridge errors carry a message we wrote (or
 * ZeppBridge's own error text), never the token, so they are safe to show.
 */
function respondWithError(
  res: express.Response,
  error: unknown,
  action: string
) {
  log(
    'error',
    `Error ${action} ZeppBridge: ${error instanceof Error ? error.message : String(error)}`
  );
  if (error instanceof ZeppBridgeError) {
    if (error.code === 'provider_not_found') {
      return res.status(404).json({ message: 'ZeppBridge provider not found' });
    }
    if (error.status === 401 || error.status === 403) {
      return res.status(401).json({
        message:
          'ZeppBridge rejected the pull token. Check it matches ZEPPBRIDGE_PULL_TOKEN (or the token from `zeppbridge-cli pull-token`).',
        error: error.message,
      });
    }
    if (error.status === 429) {
      return res.status(429).json({
        message: 'ZeppBridge is rate limiting requests. Try again in a minute.',
        error: error.message,
      });
    }
    return res.status(502).json({
      message: 'Could not read from ZeppBridge.',
      error: publicErrorMessage(error),
    });
  }
  return res.status(500).json({
    message: 'Error communicating with ZeppBridge',
    error: publicErrorMessage(error),
  });
}

/**
 * @swagger
 * /integrations/zeppbridge/test:
 *   post:
 *     summary: Check the saved ZeppBridge URL and pull token
 *     tags: [External Integrations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId: { type: string, format: uuid }
 *     responses:
 *       200: { description: 'ZeppBridge answered; returns its version and record format' }
 *       401: { description: ZeppBridge rejected the pull token }
 *       502: { description: ZeppBridge could not be reached or is not a ZeppBridge server }
 */
router.post(
  '/test',
  authMiddleware.authenticate,
  requireSelfActor,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    const parsed = providerBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      const result = await zeppBridgeService.testZeppBridge(
        req.userId as string,
        parsed.data.providerId
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      respondWithError(res, error, 'testing');
    }
  }
);

/**
 * @swagger
 * /integrations/zeppbridge/sync:
 *   post:
 *     summary: Manually trigger a ZeppBridge sync (sleep, workouts, daily metrics)
 *     tags: [External Integrations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId: { type: string, format: uuid }
 *               startDate: { type: string, format: date, description: 'Defaults to the last 3 days, since the last sync after an outage (up to 30 days), or 30 days on the first sync' }
 *               endDate: { type: string, format: date, description: 'Defaults to today; at most 365 days after startDate' }
 *     responses:
 *       200: { description: Sync finished }
 *       400: { description: Invalid request }
 *       401: { description: ZeppBridge rejected the pull token }
 *       409: { description: A sync is already running for this account }
 *       502: { description: ZeppBridge could not be reached }
 */
router.post(
  '/sync',
  authMiddleware.authenticate,
  requireSelfActor,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    const parsed = syncBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    const userId = req.userId as string;
    const { providerId, startDate, endDate } = parsed.data;
    try {
      const started = await startProviderSync(
        syncClaimTarget(userId, 'zeppbridge', providerId),
        () =>
          zeppBridgeService.syncZeppBridgeData(
            userId,
            userId,
            providerId,
            startDate,
            endDate
          )
      );
      if (!started) {
        return res.status(409).json(SYNC_ALREADY_RUNNING_RESPONSE);
      }
      res.status(200).json(await started.running);
    } catch (error) {
      respondWithError(res, error, 'syncing');
    }
  }
);

/**
 * @swagger
 * /integrations/zeppbridge/status:
 *   get:
 *     summary: ZeppBridge connection status and last sync time
 *     tags: [External Integrations]
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: 'connected, lastSyncAt' }
 */
router.get(
  '/status',
  authMiddleware.authenticate,
  requireSelfActor,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    const parsed = providerBodySchema.safeParse({
      providerId: req.query.providerId,
    });
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      res
        .status(200)
        .json(
          await zeppBridgeService.getStatus(
            req.userId as string,
            parsed.data.providerId
          )
        );
    } catch (error) {
      respondWithError(res, error, 'reading status of');
    }
  }
);

/**
 * @swagger
 * /integrations/zeppbridge/disconnect:
 *   post:
 *     summary: Disconnect ZeppBridge (keeps already imported data)
 *     tags: [External Integrations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId: { type: string, format: uuid }
 *     responses:
 *       200: { description: Disconnected }
 *       404: { description: No ZeppBridge provider found }
 */
router.post(
  '/disconnect',
  authMiddleware.authenticate,
  requireSelfActor,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    const parsed = providerBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      const done = await zeppBridgeService.disconnect(
        req.userId as string,
        parsed.data.providerId
      );
      if (!done) {
        return res
          .status(404)
          .json({ message: 'ZeppBridge provider not found' });
      }
      res.status(200).json({ success: true });
    } catch (error) {
      respondWithError(res, error, 'disconnecting');
    }
  }
);

export default router;
