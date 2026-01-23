// SparkyFitnessServer/routes/fitbitRoutes.js

const express = require('express');
const router = express.Router();
const fitbitIntegrationService = require('../integrations/fitbit/fitbitService');
const fitbitService = require('../services/fitbitService');
const { log } = require('../config/logging');
const authMiddleware = require('../middleware/authMiddleware');

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
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/fitbit/callback`;
        const authorizationUrl = await fitbitIntegrationService.getAuthorizationUrl(userId, redirectUri);
        res.json({ authUrl: authorizationUrl });
    } catch (error) {
        log('error', `Error initiating Fitbit authorization: ${error.message}`);
        res.status(500).json({ message: 'Error initiating Fitbit authorization', error: error.message });
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
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/fitbit/callback`;

        if (!code) {
            return res.status(400).json({ message: 'Authorization code not received.' });
        }

        const result = await fitbitIntegrationService.exchangeCodeForTokens(userId, code, redirectUri);

        if (result.success) {
            res.status(200).json({ message: 'Fitbit account linked successfully.' });
        } else {
            res.status(500).json({ message: 'Failed to connect Fitbit account.' });
        }
    } catch (error) {
        log('error', `Error handling Fitbit OAuth callback: ${error.message}`);
        res.status(500).json({ message: 'Error handling Fitbit OAuth callback', error: error.message });
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
        await fitbitService.syncFitbitData(userId, 'manual');
        res.status(200).json({ message: 'Fitbit data sync completed successfully.' });
    } catch (error) {
        log('error', `Error initiating manual Fitbit sync: ${error.message}`);
        res.status(500).json({ message: 'Error initiating manual Fitbit sync', error: error.message });
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
        res.status(200).json({ message: 'Fitbit account disconnected successfully.' });
    } catch (error) {
        log('error', `Error disconnecting Fitbit account: ${error.message}`);
        res.status(500).json({ message: 'Error disconnecting Fitbit account', error: error.message });
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
        log('error', `Error getting Fitbit status: ${error.message}`);
        res.status(500).json({ message: 'Error getting Fitbit status', error: error.message });
    }
});

module.exports = router;
