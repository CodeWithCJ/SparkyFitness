const express = require('express');
const router = express.Router();
const globalSettingsRepository = require('../models/globalSettingsRepository');
const { log } = require('../config/logging');
const { isAdmin } = require('../middleware/authMiddleware');

// GET Global Authentication Settings (Admin Only)
router.get('/', isAdmin, async (req, res) => {
    try {
        const settings = await globalSettingsRepository.getGlobalSettings();
        res.json(settings);
    } catch (error) {
        log('error', `Error getting global auth settings: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving global auth settings' });
    }
});

// PUT/Update Global Authentication Settings (Admin Only)
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