const express = require('express');
const router = express.Router();
const globalSettingsRepository = require('../models/globalSettingsRepository');
const { log } = require('../config/logging');
const { isAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /admin/global-settings:
 *   get:
 *     summary: GET Global Authentication Settings (Admin Only)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Global settings.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GlobalSettings'
 */
router.get('/', isAdmin, async (req, res) => {
    try {
        const settings = await globalSettingsRepository.getGlobalSettings();
        res.json(settings);
    } catch (error) {
        log('error', `Error getting global auth settings: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving global auth settings' });
    }
});

/**
 * @swagger
 * /admin/global-settings:
 *   put:
 *     summary: Update Global Authentication Settings (Admin Only)
 *     tags: [System & Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GlobalSettings'
 *     responses:
 *       200:
 *         description: Settings updated successfully.
 */
router.put('/', isAdmin, async (req, res) => {
    try {
        const settingsData = req.body;
        const newSettings = await globalSettingsRepository.saveGlobalSettings(settingsData);
        log('info', 'Global auth settings updated successfully.');
        res.status(200).json(newSettings);
    } catch (error) {
        log('error', `Error updating global auth settings: ${error.message}`);
        res.status(500).json({ message: 'Error updating global auth settings' });
    }
});

module.exports = router;