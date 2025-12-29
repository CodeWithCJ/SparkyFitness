const express = require('express');
const router = express.Router();
const customNutrientService = require('../services/customNutrientService');
const { authenticate } = require('../middleware/authMiddleware');
const { log } = require('../config/logging');

// Apply authentication middleware to all routes
router.use(authenticate);

// POST /api/custom-nutrients
router.post('/', async (req, res, next) => {
    try {
                const { name, unit } = req.body;
                const newCustomNutrient = await customNutrientService.createCustomNutrient(req.userId, { name, unit });
                res.status(201).json(newCustomNutrient);
    } catch (error) {
        log('error', `Error creating custom nutrient: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

// GET /api/custom-nutrients
router.get('/', async (req, res, next) => {
    try {
        const customNutrients = await customNutrientService.getCustomNutrients(req.userId);
        res.status(200).json(customNutrients);
    } catch (error) {
        log('error', `Error fetching custom nutrients: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

// GET /api/custom-nutrients/:id
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const customNutrient = await customNutrientService.getCustomNutrientById(req.userId, id);
        if (customNutrient) {
            res.status(200).json(customNutrient);
        } else {
            res.status(404).json({ message: 'Custom nutrient not found.' });
        }
    } catch (error) {
        log('error', `Error fetching custom nutrient by ID: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

// PUT /api/custom-nutrients/:id
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
                const { name, unit } = req.body;
                const updatedCustomNutrient = await customNutrientService.updateCustomNutrient(req.userId, id, { name, unit });
                if (updatedCustomNutrient) {
            res.status(200).json(updatedCustomNutrient);
        } else {
            res.status(404).json({ message: 'Custom nutrient not found or unauthorized.' });
        }
    } catch (error) {
        log('error', `Error updating custom nutrient: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

// DELETE /api/custom-nutrients/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const success = await customNutrientService.deleteCustomNutrient(req.userId, id);
        if (success) {
            res.status(200).json({ message: 'Custom nutrient deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Custom nutrient not found or unauthorized.' });
        }
    } catch (error) {
        log('error', `Error deleting custom nutrient: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

module.exports = router;
