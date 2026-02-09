// SparkyFitnessServer/routes/withingsRoutes.js

const express = require('express');
const router = express.Router();
const withingsService = require('../integrations/withings/withingsService');
const { log } = require('../config/logging');
const authMiddleware = require('../middleware/authMiddleware'); // Import the entire module

/**
 * @swagger
 * /integrations/withings/authorize:
 *   get:
 *     summary: Initiate Withings OAuth flow
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Authorization URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authUrl: { type: 'string' }
 */
router.get('/authorize', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId; // Assuming user ID is available from authentication
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/withings/callback`;
        const authorizationUrl = await withingsService.getAuthorizationUrl(userId, redirectUri);
        res.json({ authUrl: authorizationUrl });
    } catch (error) {
        log('error', `Error initiating Withings authorization: ${error.message}`);
        res.status(500).json({ message: 'Error initiating Withings authorization', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/withings/callback:
 *   post:
 *     summary: Handle Withings OAuth callback
 *     tags: [External Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: 'string' }
 *               state: { type: 'string' }
 *               error: { type: 'string', nullable: true }
 *     responses:
 *       200:
 *         description: Successfully linked.
 */
router.post('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.body;

        if (error) {
            log('error', `Withings OAuth callback error: ${error}`);
            return res.status(400).json({ message: 'Withings OAuth error', error });
        }

        if (!code) {
            return res.status(400).json({ message: 'Authorization code not received.' });
        }

        // In a real application, 'state' should be validated against a stored value
        // associated with the user who initiated the authorization flow.
        // For now, we'll just log it.
        log('info', `Withings OAuth callback received. State: ${state}`);

        // Assuming we can derive userId from the state or a session,
        // for this example, we'll need to pass a placeholder or retrieve it differently.
        // In a production app, 'state' would typically contain a user identifier or a session ID.
        // For simplicity, let's assume a fixed user ID for now, or pass it through state.        
        // containing the userId, which can be decrypted/verified here.
        const userId = state; // The userId was passed in the state parameter

        const tokenExchangeResult = await withingsService.exchangeCodeForTokens(userId, code, `${process.env.SPARKY_FITNESS_FRONTEND_URL}/withings/callback`, state);

        if (tokenExchangeResult.success) {
            res.status(200).json({ message: 'Withings account linked successfully.' });
        } else {
            res.status(500).json({ message: 'Failed to connect Withings account.' });
        }
    } catch (error) {
        log('error', `Error handling Withings OAuth callback: ${error.message}`);
        res.status(500).json({ message: 'Error handling Withings OAuth callback', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/withings/sync:
 *   post:
 *     summary: Manually trigger a Withings data sync
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Sync completed successfully.
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
    log('info', 'Received request to /withings/sync');
    try {
        const userId = req.userId;
        const withingsServiceCentral = require('../services/withingsService');

        const result = await withingsServiceCentral.syncWithingsData(userId, 'manual');

        log('info', `Withings data sync completed for user ${userId}. Source: ${result.source}`);
        res.status(200).json({
            message: 'Withings data sync completed successfully.',
            source: result.source,
            cached_date: result.cached_date
        });
    } catch (error) {
        log('error', `Error initiating manual Withings sync: ${error.message}`);
        res.status(500).json({ message: 'Error initiating manual Withings sync', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/withings/disconnect:
 *   post:
 *     summary: Disconnect a Withings account
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully.
 */
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        await withingsService.disconnectWithings(userId);
        res.status(200).json({ message: 'Withings account disconnected successfully.' });
    } catch (error) {
        log('error', `Error disconnecting Withings account: ${error.message}`);
        res.status(500).json({ message: 'Error disconnecting Withings account', error: error.message });
    }
});

/**
 * @swagger
 * /integrations/withings/status:
 *   get:
 *     summary: Get Withings connection status and last sync time
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Connection status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WithingsStatus'
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const status = await withingsService.getStatus(userId);
        res.status(200).json(status);
    } catch (error) {
        log('error', `Error getting Withings status: ${error.message}`);
        res.status(500).json({ message: 'Error getting Withings status', error: error.message });
    }
});

module.exports = router;