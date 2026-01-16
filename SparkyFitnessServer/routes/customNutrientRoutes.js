const express = require('express');
const router = express.Router();
const customNutrientService = require('../services/customNutrientService');
const { authenticate } = require('../middleware/authMiddleware');
const { log } = require('../config/logging');

// Apply authentication middleware to all routes
router.use(authenticate);

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
 *     CustomNutrient:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The unique identifier for the custom nutrient.
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns the custom nutrient.
 *         name:
 *           type: string
 *           description: The name of the custom nutrient.
 *         unit:
 *           type: string
 *           description: The unit of measurement for the custom nutrient.
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the custom nutrient was created.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: 'The date and time when the custom nutrient was last updated.'
 *       required:
 *         - id
 *         - user_id
 *         - name
 *         - unit
 */

/**
 * @swagger
 * /custom-nutrients:
 *   post:
 *     summary: Create a new custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Creates a new custom nutrient for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the custom nutrient.
 *               unit:
 *                 type: string
 *                 description: The unit of measurement for the custom nutrient.
 *     responses:
 *       201:
 *         description: The new custom nutrient was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to create custom nutrient.
 */
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

/**
 * @swagger
 * /custom-nutrients:
 *   get:
 *     summary: Retrieve all custom nutrients
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all custom nutrients available to the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of custom nutrients.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to fetch custom nutrients.
 */
router.get('/', async (req, res, next) => {
    try {
        const customNutrients = await customNutrientService.getCustomNutrients(req.userId);
        res.status(200).json(customNutrients);
    } catch (error) {
        log('error', `Error fetching custom nutrients: ${error.message}`, { userId: req.userId, error: error.stack });
        next(error);
    }
});

/**
 * @swagger
 * /custom-nutrients/{id}:
 *   get:
 *     summary: Retrieve a single custom nutrient by ID
 *     tags: [Nutrition & Meals]
 *     description: Retrieves a single custom nutrient by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to retrieve.
 *     responses:
 *       200:
 *         description: The requested custom nutrient.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found.
 *       500:
 *         description: Failed to fetch custom nutrient.
 */
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

/**
 * @swagger
 * /custom-nutrients/{id}:
 *   put:
 *     summary: Update a custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing custom nutrient.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the custom nutrient.
 *               unit:
 *                 type: string
 *                 description: The new unit of measurement for the custom nutrient.
 *     responses:
 *       200:
 *         description: The custom nutrient was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomNutrient'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found or unauthorized.
 *       500:
 *         description: Failed to update custom nutrient.
 */
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

/**
 * @swagger
 * /custom-nutrients/{id}:
 *   delete:
 *     summary: Delete a custom nutrient
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific custom nutrient.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the custom nutrient to delete.
 *     responses:
 *       200:
 *         description: Custom nutrient deleted successfully.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Custom nutrient not found or unauthorized.
 *       500:
 *         description: Failed to delete custom nutrient.
 */
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
