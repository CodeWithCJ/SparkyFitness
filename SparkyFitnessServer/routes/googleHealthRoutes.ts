import express from 'express';
import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import googleHealthService from '../services/googleHealthService.js';
import { log } from '../config/logging.js';
import authMiddleware from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import {
  CallbackBodySchema,
  SyncBodySchema,
} from '../schemas/googleHealthSchemas.js';

const router = express.Router();

/**
 * @swagger
 * /integrations/googlehealth/authorize:
 *   get:
 *     summary: Initiate Google Health OAuth flow
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
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const baseUrl =
        process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
      const redirectUri = `${baseUrl}/googlehealth/callback`;
      const authUrl = await googleHealthIntegrationService.getAuthorizationUrl(
        userId,
        redirectUri
      );
      res.json({ authUrl });
    } catch (error) {
      log(
        'error',
        `Error initiating Google Health authorization: ${(error as Error).message}`
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/googlehealth/callback:
 *   post:
 *     summary: Handle Google Health OAuth callback
 *     tags: [External Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 */
router.post(
  '/callback',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const bodyResult = CallbackBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }
      const { code } = bodyResult.data;
      const userId = req.userId;
      const baseUrl =
        process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
      const redirectUri = `${baseUrl}/googlehealth/callback`;
      const result = await googleHealthIntegrationService.exchangeCodeForTokens(
        userId,
        code,
        redirectUri
      );
      if (result.success) {
        res
          .status(200)
          .json({ message: 'Google Health account linked successfully.' });
      } else {
        res
          .status(500)
          .json({ message: 'Failed to connect Google Health account.' });
      }
    } catch (error) {
      log(
        'error',
        `Error handling Google Health OAuth callback: ${(error as Error).message}`
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/googlehealth/sync:
 *   post:
 *     summary: Manually trigger a Google Health data sync
 *     tags: [External Integrations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 */
router.post(
  '/sync',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const bodyResult = SyncBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }
      const { startDate, endDate } = bodyResult.data;
      const userId = req.userId;
      log(
        'info',
        `[googleHealthRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
      );
      googleHealthService
        .syncGoogleHealthData(userId, 'manual', startDate, endDate)
        .catch((err: Error) => {
          log(
            'error',
            `Background Google Health sync failed for user ${userId}: ${err.message}`
          );
        });
      res.status(202).json({ message: 'Google Health sync started.' });
    } catch (error) {
      log(
        'error',
        `Error initiating manual Google Health sync: ${(error as Error).message}`
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/googlehealth/disconnect:
 *   post:
 *     summary: Disconnect a Google Health account
 *     tags: [External Integrations]
 */
router.post(
  '/disconnect',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      await googleHealthService.disconnectGoogleHealth(userId);
      res
        .status(200)
        .json({ message: 'Google Health account disconnected successfully.' });
    } catch (error) {
      log(
        'error',
        `Error disconnecting Google Health account: ${(error as Error).message}`
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /integrations/googlehealth/status:
 *   get:
 *     summary: Get Google Health connection status
 *     tags: [External Integrations]
 */
router.get(
  '/status',
  authMiddleware.authenticate,
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const status = await googleHealthService.getStatus(userId);
      res.status(200).json(status);
    } catch (error) {
      log(
        'error',
        `Error getting Google Health status: ${(error as Error).message}`
      );
      next(error);
    }
  }
);

export default router;
