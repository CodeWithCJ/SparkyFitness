// SparkyFitnessServer/routes/hevyRoutes.js

const express = require('express');
const router = express.Router();
const hevyService = require('../integrations/hevy/hevyService');
const { log } = require('../config/logging');
const authMiddleware = require('../middleware/authMiddleware');
const { encrypt, ENCRYPTION_KEY } = require('../security/encryption');
const { getSystemClient } = require('../db/poolManager');

/**
 * @swagger
 * /api/integrations/hevy/connect:
 *   post:
 *     summary: Connect Hevy account using an API key
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: The Hevy API key
 *     responses:
 *       200:
 *         description: Hevy account connected successfully.
 */
router.post('/connect', authMiddleware.authenticate, async (req, res) => {
    const client = await getSystemClient();
    try {
        const { apiKey } = req.body;
        const userId = req.userId;

        if (!apiKey) {
            return res.status(400).json({ message: 'API key is required.' });
        }

        // Encrypt the API key
        const encryptedKey = await encrypt(apiKey, ENCRYPTION_KEY);

        // Store or update the provider in the database
        await client.query(
            `INSERT INTO external_data_providers (
                user_id, provider_name, provider_type, encrypted_app_key, app_key_iv, app_key_tag, is_active, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (user_id, provider_name) DO UPDATE SET
                encrypted_app_key = EXCLUDED.encrypted_app_key,
                app_key_iv = EXCLUDED.app_key_iv,
                app_key_tag = EXCLUDED.app_key_tag,
                is_active = TRUE,
                updated_at = NOW()`,
            [
                userId,
                'Hevy',
                'hevy',
                encryptedKey.encryptedText,
                encryptedKey.iv,
                encryptedKey.tag
            ]
        );

        res.status(200).json({ message: 'Hevy account connected successfully.' });
    } catch (error) {
        log('error', `Error connecting Hevy account: ${error.message}`);
        res.status(500).json({ message: 'Error connecting Hevy account', error: error.message });
    } finally {
        client.release();
    }
});

/**
 * @swagger
 * /api/integrations/hevy/sync:
 *   post:
 *     summary: Manually trigger a Hevy data sync
 *     tags: [External Integrations]
 */
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const createdByUserId = req.userId; // Currently same as userId
        const result = await hevyService.syncHevyData(userId, createdByUserId);
        res.status(200).json(result);
    } catch (error) {
        log('error', `Error initiating manual Hevy sync: ${error.message}`);
        res.status(500).json({ message: 'Error initiating manual Hevy sync', error: error.message });
    }
});

/**
 * @swagger
 * /api/integrations/hevy/disconnect:
 *   post:
 *     summary: Disconnect Hevy account
 *     tags: [External Integrations]
 */
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        await hevyService.disconnectHevy(userId);
        res.status(200).json({ message: 'Hevy account disconnected successfully.' });
    } catch (error) {
        log('error', `Error disconnecting Hevy account: ${error.message}`);
        res.status(500).json({ message: 'Error disconnecting Hevy account', error: error.message });
    }
});

/**
 * @swagger
 * /api/integrations/hevy/status:
 *   get:
 *     summary: Get Hevy connection status
 *     tags: [External Integrations]
 */
router.get('/status', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const status = await hevyService.getStatus(userId);
        res.status(200).json(status);
    } catch (error) {
        log('error', `Error getting Hevy status: ${error.message}`);
        res.status(500).json({ message: 'Error getting Hevy status', error: error.message });
    }
});

module.exports = router;
