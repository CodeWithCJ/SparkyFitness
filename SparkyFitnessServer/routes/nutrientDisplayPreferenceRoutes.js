const express = require('express');
const router = express.Router();
const nutrientDisplayPreferenceService = require('../services/nutrientDisplayPreferenceService');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Nutrition & Meals
 *   description: Food database, meal planning, meal types, and nutritional tracking.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     NutrientDisplayPreference:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns the preference.
 *         view_group:
 *           type: string
 *           description: The group for which the preference applies (e.g., "daily", "meal").
 *         platform:
 *           type: string
 *           description: The platform for which the preference applies (e.g., "web", "mobile").
 *         visible_nutrients:
 *           type: array
 *           items:
 *             type: string
 *           description: An array of nutrient names that should be visible.
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the preference was created.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the preference was last updated.
 *       required:
 *         - user_id
 *         - view_group
 *         - platform
 *         - visible_nutrients
 */

/**
 * @swagger
 * /nutrient-display-preferences:
 *   get:
 *     summary: Get all nutrient display preferences for the logged-in user
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all nutrient display preferences for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of nutrient display preferences.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NutrientDisplayPreference'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to fetch nutrient display preferences.
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const preferences = await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(req.userId);
        res.json(preferences);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /nutrient-display-preferences/{viewGroup}/{platform}:
 *   put:
 *     summary: Upsert a nutrient display preference
 *     tags: [Nutrition & Meals]
 *     description: Creates or updates a nutrient display preference for a specific view group and platform for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: viewGroup
 *         required: true
 *         schema:
 *           type: string
 *         description: The group for which the preference applies (e.g., "daily", "meal").
 *       - in: path
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *         description: The platform for which the preference applies (e.g., "web", "mobile").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - visible_nutrients
 *             properties:
 *               visible_nutrients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of nutrient names that should be visible.
 *     responses:
 *       200:
 *         description: The nutrient display preference was upserted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NutrientDisplayPreference'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to upsert nutrient display preference.
 */
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

/**
 * @swagger
 * /nutrient-display-preferences/{viewGroup}/{platform}:
 *   delete:
 *     summary: Reset a nutrient display preference to default
 *     tags: [Nutrition & Meals]
 *     description: Resets a specific nutrient display preference to its default settings for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: viewGroup
 *         required: true
 *         schema:
 *           type: string
 *         description: The group for which the preference applies (e.g., "daily", "meal").
 *       - in: path
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *         description: The platform for which the preference applies (e.g., "web", "mobile").
 *     responses:
 *       200:
 *         description: The nutrient display preference was reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NutrientDisplayPreference'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to reset nutrient display preference.
 */
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
