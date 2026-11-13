import { resolveMockDataOptions } from '../utils/mockDataOptions.js';
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaService from '../services/stravaService.js';
import { log } from '../config/logging.js';
import requireSelfActor from '../middleware/requireSelfMiddleware.js';
import {
  SYNC_ALREADY_RUNNING_RESPONSE,
  startProviderSync,
} from '../services/providerSyncClaim.js';
import { publicErrorMessage } from '../utils/errors.js';
const router = express.Router();
// All Strava routes require authentication, and — when acting in a switched
// family context — diary access to the active user.
router.use(authMiddleware.authenticate);
router.use(checkPermissionMiddleware('diary'));
/**
 * GET /authorize
 * Returns the Strava OAuth authorization URL
 */
// Self-only: the router-level diary gate resolves to diary_read on GET, which
// would expose the owner's OAuth client id to a read-only delegate.
router.get('/authorize', requireSelfActor, async (req, res) => {
  try {
    const userId = req.userId;
    const redirectUri =
      req.query.redirect_uri ||
      `${process.env.SPARKY_FITNESS_FRONTEND_URL}/strava/callback`;
    const authUrl = await stravaIntegrationService.getAuthorizationUrl(
      userId,
      redirectUri
    );
    res.json({ url: authUrl });
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[stravaRoutes] Error getting authorization URL: ${error.message}`
    );
    res.status(500).json({ error: publicErrorMessage(error) });
  }
});
/**
 * POST /callback
 * Exchange authorization code for tokens
 */
router.post('/callback', async (req, res) => {
  try {
    const userId = req.userId;
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required.' });
    }
    const result = await stravaIntegrationService.exchangeCodeForTokens(
      userId,
      code
    );
    res.json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[stravaRoutes] Error exchanging code: ${error.message}`);
    res.status(500).json({ error: publicErrorMessage(error) });
  }
});
/**
 * POST /sync
 * Trigger a manual Strava data sync
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.body;
    const { dataSource, saveMockData } = await resolveMockDataOptions(
      req.body,
      req.authenticatedUserId
    );
    log(
      'info',
      `[stravaRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}${dataSource ? ` (Source: ${dataSource})` : ''}`
    );
    const started = await startProviderSync(
      { userId, providerType: 'strava' },
      () =>
        stravaService.syncStravaData(
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
    const result = await started.running;
    res.json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[stravaRoutes] Error syncing data: ${error.message}`);
    res.status(500).json({ error: publicErrorMessage(error) });
  }
});
/**
 * POST /disconnect
 * Disconnect Strava integration
 */
router.post('/disconnect', async (req, res) => {
  try {
    const userId = req.userId;
    const result = await stravaService.disconnectStrava(userId);
    res.json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[stravaRoutes] Error disconnecting: ${error.message}`);
    res.status(500).json({ error: publicErrorMessage(error) });
  }
});
/**
 * GET /status
 * Get Strava connection status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.userId;
    const status = await stravaService.getStatus(userId);
    res.json(status);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[stravaRoutes] Error getting status: ${error.message}`);
    res.status(500).json({ error: publicErrorMessage(error) });
  }
});
export default router;
