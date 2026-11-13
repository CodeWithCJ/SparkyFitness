import express from 'express';
import { resolveMockDataOptions } from '../utils/mockDataOptions.js';
import corosIntegrationService, {
  CorosRedirectUriError,
  CorosReauthRequiredError,
  getCorosRedirectUri,
} from '../integrations/coros/corosService.js';
import corosService from '../services/corosService.js';
import { log } from '../config/logging.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import { OAuthStateError } from '../utils/oauthState.js';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import {
  CallbackBodySchema,
  SyncBodySchema,
  DisconnectBodySchema,
} from '../schemas/corosSchemas.js';
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  syncClaimTarget,
  startProviderSync,
} from '../services/providerSyncClaim.js';
import { publicErrorMessage } from '../utils/errors.js';

const router = express.Router();

/**
 * @swagger
 * /integrations/coros/authorize:
 *   get:
 *     summary: Initiate COROS OAuth flow
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         description: Optional ID of the specific COROS provider
 *     responses:
 *       200:
 *         description: Successfully generated authorization URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authUrl:
 *                   type: string
 *       400:
 *         description: Invalid redirect URI (e.g. non-HTTPS remote URL).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error initiating COROS authorization.
 */
router.get(
  '/authorize',
  authMiddleware.authenticate,
  requireSelfActor,
  async (req, res) => {
    try {
      const userId = req.userId;
      const rawProviderId = req.query.providerId;
      const providerId =
        typeof rawProviderId === 'string' && rawProviderId.length > 0
          ? rawProviderId
          : null;
      const redirectUri = getCorosRedirectUri();
      const authorizationUrl =
        await corosIntegrationService.getAuthorizationUrl(
          userId,
          redirectUri,
          providerId
        );
      res.json({ authUrl: authorizationUrl });
    } catch (error: unknown) {
      if (error instanceof CorosRedirectUriError) {
        log('warn', `COROS authorize rejected: ${error.message}`);
        return res.status(400).json({ message: error.message });
      }
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error initiating COROS authorization: ${message}`);
      res.status(500).json({
        message: 'Error initiating COROS authorization',
        error: publicErrorMessage(error),
      });
    }
  }
);

/**
 * @swagger
 * /integrations/coros/callback:
 *   post:
 *     summary: Handle COROS OAuth callback
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - state
 *             properties:
 *               code:
 *                 type: string
 *               state:
 *                 type: string
 *     responses:
 *       200:
 *         description: COROS account linked successfully.
 *       400:
 *         description: Authorization code not received or invalid OAuth state.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (state not bound to authenticated user).
 *       500:
 *         description: Failed to connect COROS account.
 */
router.post('/callback', authMiddleware.authenticate, async (req, res) => {
  try {
    const parsed = CallbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid callback parameters.',
        errors: parsed.error.issues,
      });
    }
    const { code, state } = parsed.data;
    const redirectUri = getCorosRedirectUri();
    const actorUserId =
      req.originalUserId || req.authenticatedUserId || req.userId;

    const result = await corosIntegrationService.exchangeCodeForTokens(
      state,
      code,
      redirectUri,
      actorUserId
    );

    if (result.ownerUserId !== actorUserId) {
      log(
        'warn',
        `COROS callback owner ${result.ownerUserId} did not match actor ${actorUserId}.`
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: OAuth state is not bound to this user.' });
    }

    if (result.success) {
      res.status(200).json({ message: 'COROS account linked successfully.' });
    } else {
      res.status(500).json({ message: 'Failed to connect COROS account.' });
    }
  } catch (error: unknown) {
    if (
      error instanceof OAuthStateError ||
      (error instanceof Error && error.name === 'OAuthStateError')
    ) {
      const reason =
        error instanceof OAuthStateError
          ? error.reason
          : (error as Error).message;
      log('warn', `COROS OAuth state rejected (${reason}).`);
      return res
        .status(400)
        .json({ message: 'Invalid or expired authorization state.' });
    }
    const message = error instanceof Error ? error.message : String(error);
    log('error', `Error handling COROS OAuth callback: ${message}`);
    res.status(500).json({
      message: 'Error handling COROS OAuth callback',
      error: publicErrorMessage(error),
    });
  }
});

/**
 * @swagger
 * /integrations/coros/sync:
 *   post:
 *     summary: Manually trigger a COROS data sync
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 example: 2026-09-01
 *               endDate:
 *                 type: string
 *                 example: 2026-09-27
 *     responses:
 *       200:
 *         description: COROS data sync completed successfully.
 *       401:
 *         description: Unauthorized.
 *       409:
 *         description: Re-authentication required.
 *       500:
 *         description: Error executing COROS sync.
 */
router.post(
  '/sync',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const parsed = SyncBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Invalid sync parameters.',
          errors: parsed.error.issues,
        });
      }

      const userId = req.userId;
      const { providerId, startDate, endDate } = parsed.data;
      const { dataSource, saveMockData } = await resolveMockDataOptions(
        req.body,
        req.authenticatedUserId
      );

      log(
        'info',
        `[corosRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}${dataSource ? ` (Source: ${dataSource})` : ''}`
      );

      const started = await startProviderSync(
        syncClaimTarget(userId, 'coros_mcp', providerId),
        () =>
          corosService.syncCorosData(
            userId,
            'manual',
            providerId || null,
            startDate || null,
            endDate || null,
            dataSource,
            saveMockData
          )
      );
      if (!started) {
        res.status(409).json(SYNC_ALREADY_RUNNING_RESPONSE);
        return;
      }
      const syncResult = await started.running;

      res.status(200).json({
        message: 'COROS data sync completed successfully.',
        ...syncResult,
      });
    } catch (error: unknown) {
      if (error instanceof CorosReauthRequiredError) {
        return res.status(409).json({
          message:
            'Your COROS connection has expired. Click Connect to sign in again.',
          code: 'COROS_REAUTH_REQUIRED',
        });
      }
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error initiating manual COROS sync: ${message}`);
      res.status(500).json({
        message: 'Error initiating manual COROS sync',
        error: publicErrorMessage(error),
      });
    }
  }
);

/**
 * @swagger
 * /integrations/coros/disconnect:
 *   post:
 *     summary: Disconnect a COROS account
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: COROS account disconnected successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error disconnecting COROS account.
 */
router.post(
  '/disconnect',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const parsed = DisconnectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Invalid disconnect parameters.',
          errors: parsed.error.issues,
        });
      }
      const userId = req.userId;
      const { providerId } = parsed.data;
      await corosIntegrationService.disconnectCoros(userId, providerId || null);
      res
        .status(200)
        .json({ message: 'COROS account disconnected successfully.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error disconnecting COROS account: ${message}`);
      res.status(500).json({
        message: 'Error disconnecting COROS account',
        error: publicErrorMessage(error),
      });
    }
  }
);

/**
 * @swagger
 * /integrations/coros/status:
 *   get:
 *     summary: Get COROS integration status
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved COROS status.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error getting COROS status.
 */
router.get(
  '/status',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const userId = req.userId;
      const rawProviderId = req.query.providerId;
      const providerId =
        typeof rawProviderId === 'string' && rawProviderId.length > 0
          ? rawProviderId
          : null;
      const status = await corosIntegrationService.getStatus(
        userId,
        providerId
      );
      res.json(status);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', `Error getting COROS status: ${message}`);
      res.status(500).json({
        message: 'Error getting COROS status',
        error: publicErrorMessage(error),
      });
    }
  }
);

export default router;
