import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaService from '../services/stravaService.js';
import { log } from '../config/logging.js';
const router = express.Router();
// All Strava routes require authentication
router.use(authMiddleware.authenticate);
/**
 * GET /authorize
 * Returns the Strava OAuth authorization URL
 */
router.get('/authorize', async (req, res) => {
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
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    res.status(500).json({ error: error.message });
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
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    res.status(500).json({ error: error.message });
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
    log(
      'info',
      `[stravaRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
    );
    const result = await stravaService.syncStravaData(
      userId,
      'manual',
      startDate,
      endDate
    );
    res.json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[stravaRoutes] Error syncing data: ${error.message}`);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    res.status(500).json({ error: error.message });
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
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    res.status(500).json({ error: error.message });
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
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    res.status(500).json({ error: error.message });
  }
});
export default router;
