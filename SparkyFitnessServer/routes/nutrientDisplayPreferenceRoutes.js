const express = require('express');
const router = express.Router();
const nutrientDisplayPreferenceService = require('../services/nutrientDisplayPreferenceService');
const { authenticate } = require('../middleware/authMiddleware');

// Get all nutrient display preferences for the logged-in user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const preferences = await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(req.userId);
        res.json(preferences);
    } catch (error) {
        next(error);
    }
});

// Upsert a nutrient display preference
router.put('/:viewGroup/:platform', authenticate, async (req, res, next) => {
    try {
        const { viewGroup, platform } = req.params;
        const { visible_nutrients } = req.body;
        const preference = await nutrientDisplayPreferenceService.upsertNutrientDisplayPreference(req.userId, viewGroup, platform, visible_nutrients);
        res.json(preference);
    } catch (error) {
        next(error);
    }
});

// Reset a nutrient display preference to default
router.delete('/:viewGroup/:platform', authenticate, async (req, res, next) => {
    try {
        const { viewGroup, platform } = req.params;
        const defaultPreference = await nutrientDisplayPreferenceService.resetNutrientDisplayPreference(req.userId, viewGroup, platform);
        res.json(defaultPreference);
    } catch (error) {
        next(error);
    }
});

module.exports = router;