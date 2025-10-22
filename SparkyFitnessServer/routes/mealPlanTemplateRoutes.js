const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const mealPlanTemplateService = require('../services/mealPlanTemplateService');

// --- Meal Day Preset Routes ---

// Create a new meal day preset
router.post('/presets', authenticate, async (req, res, next) => {
    try {
        const newPreset = await mealPlanTemplateService.createMealDayPreset(req.userId, req.body);
        res.status(201).json(newPreset);
    } catch (error) {
        next(error);
    }
});

// Get all meal day presets for a user
router.get('/presets', authenticate, async (req, res, next) => {
    try {
        const presets = await mealPlanTemplateService.getMealDayPresets(req.userId);
        res.status(200).json(presets);
    } catch (error) {
        next(error);
    }
});

// Update a meal day preset
router.put('/presets/:id', authenticate, async (req, res, next) => {
    try {
        const updatedPreset = await mealPlanTemplateService.updateMealDayPreset(req.params.id, req.userId, req.body);
        res.status(200).json(updatedPreset);
    } catch (error) {
        next(error);
    }
});

// Delete a meal day preset
router.delete('/presets/:id', authenticate, async (req, res, next) => {
    try {
        await mealPlanTemplateService.deleteMealDayPreset(req.params.id, req.userId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});


// --- Meal Plan Template Routes ---

// Create a new meal plan template
router.post('/', authenticate, async (req, res, next) => {
    try {
        const newPlan = await mealPlanTemplateService.createMealPlanTemplate(req.userId, req.body);
        res.status(201).json(newPlan);
    } catch (error) {
        next(error);
    }
});

// Get all meal plan templates for a user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const plans = await mealPlanTemplateService.getMealPlanTemplates(req.userId);
        res.status(200).json(plans);
    } catch (error) {
        next(error);
    }
});

// Update a meal plan template
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const updatedPlan = await mealPlanTemplateService.updateMealPlanTemplate(req.params.id, req.userId, req.body);
        res.status(200).json(updatedPlan);
    } catch (error) {
        next(error);
    }
});

// Delete a meal plan template
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await mealPlanTemplateService.deleteMealPlanTemplate(req.params.id, req.userId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

module.exports = router;