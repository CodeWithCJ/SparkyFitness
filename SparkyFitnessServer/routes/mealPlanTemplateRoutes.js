const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const mealPlanTemplateService = require('../services/mealPlanTemplateService');

// --- Meal Day Preset Routes ---

/**
 * @swagger
 * /meal-plan-templates/presets:
 *   post:
 *     summary: Create a new meal day preset
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal day preset for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealDayPreset'
 *     responses:
 *       201:
 *         description: The meal day preset was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealDayPreset'
 *       403:
 *         description: User does not have permission to create a meal day preset.
 */
router.post('/presets', authenticate, async (req, res, next) => {
    try {
        const newPreset = await mealPlanTemplateService.createMealDayPreset(req.userId, req.body);
        res.status(201).json(newPreset);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates/presets:
 *   get:
 *     summary: Get all meal day presets for a user
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all meal day presets owned by the authenticated user.
 *     responses:
 *       200:
 *         description: A list of meal day presets.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MealDayPreset'
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/presets', authenticate, async (req, res, next) => {
    try {
        const presets = await mealPlanTemplateService.getMealDayPresets(req.userId);
        res.status(200).json(presets);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates/presets/{id}:
 *   put:
 *     summary: Update a meal day preset
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing meal day preset.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal day preset to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealDayPreset'
 *     responses:
 *       200:
 *         description: The meal day preset was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealDayPreset'
 *       403:
 *         description: User does not have permission to update this meal day preset.
 *       404:
 *         description: Meal day preset not found.
 */
router.put('/presets/:id', authenticate, async (req, res, next) => {
    try {
        const updatedPreset = await mealPlanTemplateService.updateMealDayPreset(req.params.id, req.userId, req.body);
        res.status(200).json(updatedPreset);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates/presets/{id}:
 *   delete:
 *     summary: Delete a meal day preset
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific meal day preset.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal day preset to delete.
 *     responses:
 *       204:
 *         description: Meal day preset deleted successfully.
 *       403:
 *         description: User does not have permission to delete this meal day preset.
 *       404:
 *         description: Meal day preset not found.
 */
router.delete('/presets/:id', authenticate, async (req, res, next) => {
    try {
        await mealPlanTemplateService.deleteMealDayPreset(req.params.id, req.userId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});


// --- Meal Plan Template Routes ---

/**
 * @swagger
 * /meal-plan-templates:
 *   post:
 *     summary: Create a new meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal plan template for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealPlanTemplate'
 *     responses:
 *       201:
 *         description: The meal plan template was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to create a meal plan template.
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const newPlan = await mealPlanTemplateService.createMealPlanTemplate(req.userId, req.body);
        res.status(201).json(newPlan);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates:
 *   get:
 *     summary: Get all meal plan templates for a user
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all meal plan templates owned by the authenticated user.
 *     responses:
 *       200:
 *         description: A list of meal plan templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const plans = await mealPlanTemplateService.getMealPlanTemplates(req.userId);
        res.status(200).json(plans);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates/{id}:
 *   put:
 *     summary: Update a meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing meal plan template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan template to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealPlanTemplate'
 *     responses:
 *       200:
 *         description: The meal plan template was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to update this meal plan template.
 *       404:
 *         description: Meal plan template not found.
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const updatedPlan = await mealPlanTemplateService.updateMealPlanTemplate(req.params.id, req.userId, req.body);
        res.status(200).json(updatedPlan);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /meal-plan-templates/{id}:
 *   delete:
 *     summary: Delete a meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific meal plan template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan template to delete.
 *     responses:
 *       204:
 *         description: Meal plan template deleted successfully.
 *       403:
 *         description: User does not have permission to delete this meal plan template.
 *       404:
 *         description: Meal plan template not found.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await mealPlanTemplateService.deleteMealPlanTemplate(req.params.id, req.userId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;