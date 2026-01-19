const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const waterContainerService = require('../services/waterContainerService');

/**
 * @swagger
 * /water-containers:
 *   post:
 *     summary: Create a new water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WaterContainer'
 *     responses:
 *       201:
 *         description: Water container created successfully.
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const container = await waterContainerService.createWaterContainer(req.userId, req.body);
        res.status(201).json(container);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /water-containers:
 *   get:
 *     summary: Get all water containers for the user
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of water containers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WaterContainer'
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { userId } = req.query;
        const targetUserId = userId || req.userId;

        if (targetUserId !== req.userId) {
            const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', req.userId); // Assuming diary permission allows viewing containers
            if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
        }

        const containers = await waterContainerService.getWaterContainersByUserId(targetUserId);
        res.status(200).json(containers);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /water-containers/{id}:
 *   put:
 *     summary: Update a water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WaterContainer'
 *     responses:
 *       200:
 *         description: Water container updated successfully.
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const container = await waterContainerService.updateWaterContainer(req.params.id, req.userId, req.body);
        if (!container) {
            return res.status(404).json({ error: 'Container not found or not authorized.' });
        }
        res.status(200).json(container);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /water-containers/{id}:
 *   delete:
 *     summary: Delete a water container
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted successfully.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const result = await waterContainerService.deleteWaterContainer(req.params.id, req.userId);
        res.status(200).json(result);
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

/**
 * @swagger
 * /water-containers/{id}/set-primary:
 *   put:
 *     summary: Set a water container as primary
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Primary container set successfully.
 */
router.put('/:id/set-primary', authenticate, async (req, res, next) => {
    try {
        const container = await waterContainerService.setPrimaryWaterContainer(req.params.id, req.userId);
        if (!container) {
            return res.status(404).json({ error: 'Container not found or not authorized.' });
        }
        res.status(200).json(container);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /water-containers/primary:
 *   get:
 *     summary: Get the primary water container for the user
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The primary water container.
 */
router.get('/primary', authenticate, async (req, res, next) => {
    try {
        const { userId } = req.query;
        const targetUserId = userId || req.userId;

        if (targetUserId !== req.userId) {
            const hasPermission = await require('../utils/permissionUtils').canAccessUserData(targetUserId, 'diary', req.userId);
            if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
        }

        const primaryContainer = await waterContainerService.getPrimaryWaterContainerByUserId(targetUserId);
        if (primaryContainer) {
            res.status(200).json(primaryContainer);
        } else {
            // Return a default container if no primary is found
            res.status(200).json({
                id: null, // Indicate no actual container ID
                user_id: targetUserId,
                name: 'Default Container',
                volume: 2000, // Default to 2000ml
                unit: 'ml',
                is_primary: true,
                servings_per_container: 8, // Default to 8 servings
            });
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;