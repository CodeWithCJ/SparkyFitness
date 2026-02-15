// SparkyFitnessServer/routes/polarRoutes.js

const express = require('express');
const router = express.Router();
const polarIntegrationService = require('../integrations/polar/polarService');
const polarService = require('../services/polarService');
const { log } = require('../config/logging');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @swagger
 * /integrations/polar/authorize:
 *   get:
 *     summary: Initiate Polar OAuth flow
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
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
 *                   description: The Polar authorization URL.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error initiating Polar authorization.
 */
router.get('/authorize', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { providerId } = req.query; // Optional providerId
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/polar/callback`;
        const authorizationUrl = await polarIntegrationService.getAuthorizationUrl(userId, redirectUri, providerId);
        res.json({ authUrl: authorizationUrl });
    } catch (error) {
        log('error', `Error initiating Polar authorization: ${error.message}`);
        res.status(500).json({ message: 'Error initiating Polar authorization', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/polar/callback:
 *   post:
 *     summary: Handle Polar OAuth callback
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
 *             properties:
 *               code:
 *                 type: string
 *                 description: The authorization code returned by Polar.
 *     responses:
 *       200:
 *         description: Polar account linked successfully.
 *       400:
 *         description: Authorization code not received.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Failed to connect Polar account.
 */
router.post('/callback', authMiddleware.authenticate, async (req, res) => {
    try {
        const { code, state, providerId } = req.body;
        const userId = req.userId;
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/polar/callback`;

        if (!code) {
            return res.status(400).json({ message: 'Authorization code not received.' });
        }

        const result = await polarIntegrationService.exchangeCodeForTokens(userId, code, state, redirectUri, providerId);

        if (result.success) {
            res.status(200).json({ message: 'Polar account linked successfully.' });
        } else {
            res.status(500).json({ message: 'Failed to connect Polar account.' });
        }
    } catch (error) {
        log('error', `Error handling Polar OAuth callback: ${error.message}`);
        res.status(500).json({ message: 'Error handling Polar OAuth callback', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/polar/sync:
 *   post:
 *     summary: Manually trigger a Polar data sync
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
 *                 description: The unique identifier of the Polar provider to sync.
 *     responses:
 *       200:
 *         description: Polar data sync completed successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error initiating manual Polar sync.
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { providerId } = req.body;
        await polarService.syncPolarData(userId, 'manual', providerId);
        res.status(200).json({ message: 'Polar data sync completed successfully.' });
    } catch (error) {
        log('error', `Error initiating manual Polar sync: ${error.message}`);
        res.status(500).json({ message: 'Error initiating manual Polar sync', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/polar/disconnect:
 *   post:
 *     summary: Disconnect a Polar account
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
 *                 description: The unique identifier of the Polar provider to disconnect.
 *     responses:
 *       200:
 *         description: Polar account disconnected successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error disconnecting Polar account.
 */
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { providerId } = req.body;
        await polarService.disconnectPolar(userId, providerId);
        res.status(200).json({ message: 'Polar account disconnected successfully.' });
    } catch (error) {
        log('error', `Error disconnecting Polar account: ${error.message}`);
        res.status(500).json({ message: 'Error disconnecting Polar account', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/polar/status:
 *   get:
 *     summary: Get Polar connection status
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         description: The unique identifier of the Polar provider.
 *     responses:
 *       200:
 *         description: Polar connection status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isConnected:
 *                   type: boolean
 *                 lastSyncAt:
 *                   type: string
 *                   format: date-time
 *                 tokenExpiresAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error getting Polar status.
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { providerId } = req.query;
        const status = await polarService.getStatus(userId, providerId);
        res.status(200).json(status);
    } catch (error) {
        log('error', `Error getting Polar status: ${error.message}`);
        res.status(500).json({ message: 'Error getting Polar status', error: error.message });
    }
});

module.exports = router;
