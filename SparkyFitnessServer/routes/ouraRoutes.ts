import express from 'express';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraService from '../services/ouraService.js';
import { log } from '../config/logging.js';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { CallbackBodySchema, SyncBodySchema } from '../schemas/ouraSchemas.js';
const router = express.Router();
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
  checkPermissionMiddleware('diary'),
  async (req, res) => {
    try {
      const userId = req.userId;
      const baseUrl =
        process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
      const redirectUri = `${baseUrl}/oura/callback`;
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
        error: (error as Error).message,
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
      const { code } = bodyResult.data;
      const userId = req.userId;
      const baseUrl =
        process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
      const redirectUri = `${baseUrl}/oura/callback`;
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
        error: (error as Error).message,
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
      const userId = req.userId;
      log(
        'info',
        `[ouraRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
      );
      await ouraService.syncOuraData(userId, 'manual', startDate, endDate);
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
        error: (error as Error).message,
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
        error: (error as Error).message,
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
        error: (error as Error).message,
      });
    }
  }
);
export default router;
