import express from 'express';
import { z } from 'zod';
import intervalsService, {
  intervalsErrorStatus,
} from '../integrations/intervals/intervalsService.js';
import { log } from '../config/logging.js';
import { publicErrorMessage } from '../utils/errors.js';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import { resolveMockDataOptions } from '../utils/mockDataOptions.js';
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
    // Developer tooling; honoured only for admins while mock data is enabled.
    dataSource: z.string().optional(),
    saveMockData: z.boolean().optional(),
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function badRequest(res: express.Response, error: z.ZodError) {
  return res.status(400).json({
    message: 'Invalid request',
    error: error.issues[0]?.message || 'Validation failed',
    details: error.flatten(),
  });
}

/**
 * @swagger
 * /integrations/intervals/sync:
 *   post:
 *     summary: Manually trigger an Intervals.icu sync (activities and wellness)
 *     tags: [External Integrations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId: { type: string, format: uuid }
 *               startDate: { type: string, format: date, description: 'Defaults to yesterday' }
 *               endDate: { type: string, format: date, description: 'Defaults to today; at most 365 days after startDate' }
 *     responses:
 *       200: { description: Sync finished }
 *       400: { description: Invalid request }
 *       401: { description: Intervals.icu rejected the athlete ID or API key }
 *       409: { description: A sync is already running for this account }
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
      const mock = await resolveMockDataOptions(
        parsed.data,
        req.authenticatedUserId
      );
      const started = await startProviderSync(
        syncClaimTarget(userId, 'intervals', providerId),
        () =>
          intervalsService.syncIntervalsData(
            userId,
            userId,
            providerId,
            startDate,
            endDate,
            mock
          )
      );
      if (!started) {
        return res.status(409).json(SYNC_ALREADY_RUNNING_RESPONSE);
      }
      res.status(200).json(await started.running);
    } catch (error) {
      log('error', `Error syncing Intervals.icu: ${errorMessage(error)}`);
      const status = intervalsErrorStatus(error);
      if (status === 401 || status === 403) {
        return res.status(401).json({
          message:
            'Intervals.icu rejected the athlete ID or API key. Check both under Settings > Developer Settings on intervals.icu.',
          error: errorMessage(error),
        });
      }
      res.status(500).json({
        message: 'Error syncing Intervals.icu',
        error: publicErrorMessage(error),
      });
    }
  }
);

/**
 * @swagger
 * /integrations/intervals/status:
 *   get:
 *     summary: Get Intervals.icu connection status
 *     tags: [External Integrations]
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Connection status and last sync time }
 */
router.get(
  '/status',
  authMiddleware.authenticate,
  requireSelfActor,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    const parsed = providerBodySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error);
    try {
      res
        .status(200)
        .json(
          await intervalsService.getStatus(
            req.userId as string,
            parsed.data.providerId
          )
        );
    } catch (error) {
      log(
        'error',
        `Error getting Intervals.icu status: ${errorMessage(error)}`
      );
      res.status(500).json({
        message: 'Error getting Intervals.icu status',
        error: publicErrorMessage(error),
      });
    }
  }
);

/**
 * @swagger
 * /integrations/intervals/disconnect:
 *   post:
 *     summary: Disconnect the Intervals.icu integration
 *     tags: [External Integrations]
 *     responses:
 *       200: { description: Disconnected }
 *       404: { description: No Intervals.icu provider }
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
      const disconnected = await intervalsService.disconnect(
        req.userId as string,
        parsed.data.providerId
      );
      if (!disconnected) {
        return res
          .status(404)
          .json({ message: 'Intervals.icu provider not found.' });
      }
      res
        .status(200)
        .json({ message: 'Intervals.icu disconnected successfully.' });
    } catch (error) {
      log('error', `Error disconnecting Intervals.icu: ${errorMessage(error)}`);
      res.status(500).json({
        message: 'Error disconnecting Intervals.icu',
        error: publicErrorMessage(error),
      });
    }
  }
);

export default router;
