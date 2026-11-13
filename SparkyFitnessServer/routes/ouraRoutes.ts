import { resolveMockDataOptions } from '../utils/mockDataOptions.js';
import express from 'express';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraService from '../services/ouraService.js';
import { log } from '../config/logging.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { CallbackBodySchema, SyncBodySchema } from '../schemas/ouraSchemas.js';
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  startProviderSync,
} from '../services/providerSyncClaim.js';
import { publicErrorMessage } from '../utils/errors.js';
const router = express.Router();
/**
 * Resolves and validates the canonical Oura redirect URI.
 * Normalizes trailing slashes on base URLs and validates client-requested redirect URIs.
 */
export function getOuraRedirectUri(requestedRedirectUri?: unknown): string {
  const defaultOrigin = (
    process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080'
  ).replace(/\/$/, '');
  const defaultRedirectUri = `${defaultOrigin}/oura/callback`;

  if (
    typeof requestedRedirectUri !== 'string' ||
    !requestedRedirectUri.trim()
  ) {
    return defaultRedirectUri;
  }

  try {
    const parsed = new URL(requestedRedirectUri.trim());
    if (parsed.pathname.replace(/\/$/, '') !== '/oura/callback') {
      return defaultRedirectUri;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return defaultRedirectUri;
    }

    const trustedOrigins = new Set<string>();
    trustedOrigins.add(defaultOrigin);
    if (process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS) {
      process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS.split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean)
        .forEach((o) => trustedOrigins.add(o));
    }

    const reqOrigin = parsed.origin.replace(/\/$/, '');
    if (trustedOrigins.has(reqOrigin)) {
      return `${reqOrigin}/oura/callback`;
    }

    return defaultRedirectUri;
  } catch {
    return defaultRedirectUri;
  }
}

/**
 * @swagger
 * /integrations/oura/authorize:
 *   get:
 *     summary: Initiate Oura OAuth flow
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Authorization URL.
 */
router.get(
  '/authorize',
  authMiddleware.authenticate,
  // Self-only: the diary gate resolves to diary_read on GET, which would expose
  // the owner's OAuth client id to a read-only delegate.
  requireSelfActor,
  async (req, res) => {
    try {
      const userId = req.userId;
      const redirectUri = getOuraRedirectUri(req.query.redirect_uri);
      const authorizationUrl = await ouraIntegrationService.getAuthorizationUrl(
        userId,
        redirectUri
      );
      res.json({ authUrl: authorizationUrl });
    } catch (error) {
      log(
        'error',
        `Error initiating Oura authorization: ${(error as Error).message}`
      );
      res.status(500).json({
        message: 'Error initiating Oura authorization',
        error: publicErrorMessage(error),
      });
    }
  }
);
/**
 * @swagger
 * /integrations/oura/callback:
 *   post:
 *     summary: Handle Oura OAuth callback
 *     tags: [External Integrations]
 */
router.post(
  '/callback',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const bodyResult = CallbackBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res
          .status(400)
          .json({ message: 'Authorization code not received.' });
      }
      const { code, redirect_uri } = bodyResult.data;
      const userId = req.userId;
      const redirectUri = getOuraRedirectUri(redirect_uri);
      const result = await ouraIntegrationService.exchangeCodeForTokens(
        userId,
        code,
        redirectUri
      );
      if (result.success) {
        res.status(200).json({ message: 'Oura account linked successfully.' });
      } else {
        res.status(500).json({ message: 'Failed to connect Oura account.' });
      }
    } catch (error) {
      log(
        'error',
        `Error handling Oura OAuth callback: ${(error as Error).message}`
      );
      res.status(500).json({
        message: 'Error handling Oura OAuth callback',
        error: publicErrorMessage(error),
      });
    }
  }
);
/**
 * @swagger
 * /integrations/oura/sync:
 *   post:
 *     summary: Manually trigger an Oura data sync
 *     tags: [External Integrations]
 */
router.post(
  '/sync',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const bodyResult = SyncBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: 'Invalid request body.' });
      }
      const { startDate, endDate } = bodyResult.data;
      const { dataSource, saveMockData } = await resolveMockDataOptions(
        bodyResult.data,
        req.authenticatedUserId
      );
      const userId = req.userId;
      log(
        'info',
        `[ouraRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}${dataSource ? ` (Source: ${dataSource})` : ''}`
      );
      const started = await startProviderSync(
        { userId, providerType: 'oura' },
        () =>
          ouraService.syncOuraData(
            userId,
            'manual',
            startDate,
            endDate,
            dataSource,
            saveMockData
          )
      );
      if (!started) {
        res.status(409).json(SYNC_ALREADY_RUNNING_RESPONSE);
        return;
      }
      await started.running;
      res
        .status(200)
        .json({ message: 'Oura data sync completed successfully.' });
    } catch (error) {
      log(
        'error',
        `Error initiating manual Oura sync: ${(error as Error).message}`
      );
      res.status(500).json({
        message: 'Error initiating manual Oura sync',
        error: publicErrorMessage(error),
      });
    }
  }
);
/**
 * @swagger
 * /integrations/oura/disconnect:
 *   post:
 *     summary: Disconnect an Oura account
 *     tags: [External Integrations]
 */
router.post(
  '/disconnect',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const userId = req.userId;
      await ouraService.disconnectOura(userId);
      res
        .status(200)
        .json({ message: 'Oura account disconnected successfully.' });
    } catch (error) {
      log(
        'error',
        `Error disconnecting Oura account: ${(error as Error).message}`
      );
      res.status(500).json({
        message: 'Error disconnecting Oura account',
        error: publicErrorMessage(error),
      });
    }
  }
);
/**
 * @swagger
 * /integrations/oura/status:
 *   get:
 *     summary: Get Oura connection status
 *     tags: [External Integrations]
 */
router.get(
  '/status',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const userId = req.userId;
      const status = await ouraService.getStatus(userId);
      res.status(200).json(status);
    } catch (error) {
      log('error', `Error getting Oura status: ${(error as Error).message}`);
      res.status(500).json({
        message: 'Error getting Oura status',
        error: publicErrorMessage(error),
      });
    }
  }
);
export default router;
