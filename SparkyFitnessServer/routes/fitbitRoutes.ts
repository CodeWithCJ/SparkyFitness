import express from 'express';
import fitbitIntegrationService from '../integrations/fitbit/fitbitService.js';
import fitbitService from '../services/fitbitService.js';
import { log } from '../config/logging.js';
import authMiddleware from '../middleware/authMiddleware.js';
const router = express.Router();
/**
 * @swagger
 * /integrations/fitbit/authorize:
 *   get:
 *     summary: Initiate Fitbit OAuth flow
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Authorization URL.
 */
router.get('/authorize', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const baseUrl =
      process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
    const redirectUri = `${baseUrl}/fitbit/callback`;
    const authorizationUrl = await fitbitIntegrationService.getAuthorizationUrl(
      userId,
      redirectUri
    );
    res.json({ authUrl: authorizationUrl });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error initiating Fitbit authorization: ${error.message}`);
    res.status(500).json({
      message: 'Error initiating Fitbit authorization',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
/**
 * @swagger
 * /integrations/fitbit/callback:
 *   post:
 *     summary: Handle Fitbit OAuth callback
 *     tags: [External Integrations]
 */
router.post('/callback', authMiddleware.authenticate, async (req, res) => {
  try {
    const { code } = req.body;

    const userId = req.userId;
    const baseUrl =
      process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
    const redirectUri = `${baseUrl}/fitbit/callback`;
    if (!code) {
      return res
        .status(400)
        .json({ message: 'Authorization code not received.' });
    }
    const result = await fitbitIntegrationService.exchangeCodeForTokens(
      userId,
      code,
      redirectUri
    );
    if (result.success) {
      res.status(200).json({ message: 'Fitbit account linked successfully.' });
    } else {
      res.status(500).json({ message: 'Failed to connect Fitbit account.' });
    }
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error handling Fitbit OAuth callback: ${error.message}`);
    res.status(500).json({
      message: 'Error handling Fitbit OAuth callback',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
/**
 * @swagger
 * /integrations/fitbit/sync:
 *   post:
 *     summary: Manually trigger a Fitbit data sync
 *     tags: [External Integrations]
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.body;
    log(
      'info',
      `[fitbitRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
    );
    await fitbitService.syncFitbitData(userId, 'manual', startDate, endDate);
    res
      .status(200)
      .json({ message: 'Fitbit data sync completed successfully.' });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error initiating manual Fitbit sync: ${error.message}`);
    res.status(500).json({
      message: 'Error initiating manual Fitbit sync',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
/**
 * @swagger
 * /integrations/fitbit/disconnect:
 *   post:
 *     summary: Disconnect a Fitbit account
 *     tags: [External Integrations]
 */
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    await fitbitService.disconnectFitbit(userId);
    res
      .status(200)
      .json({ message: 'Fitbit account disconnected successfully.' });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error disconnecting Fitbit account: ${error.message}`);
    res.status(500).json({
      message: 'Error disconnecting Fitbit account',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
/**
 * @swagger
 * /integrations/fitbit/status:
 *   get:
 *     summary: Get Fitbit connection status
 *     tags: [External Integrations]
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const status = await fitbitService.getStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error getting Fitbit status: ${error.message}`);
    res
      .status(500)
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      .json({ message: 'Error getting Fitbit status', error: error.message });
  }
});
export default router;
