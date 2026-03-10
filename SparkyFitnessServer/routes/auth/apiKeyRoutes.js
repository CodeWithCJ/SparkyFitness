const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { auth } = require('../../auth');

/**
 * @swagger
 * /identity/user/generate-api-key:
 *   post:
 *     summary: Generate an API key for the current user
 *     tags: [Identity & Security]
 *     description: Creates a new API key for the currently authenticated user.
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: A descriptive name for the API key.
 *               expiresIn:
 *                 type: number
 *                 description: Expiration time in seconds. Defaults to 1 year (31536000).
 *     responses:
 *       201:
 *         description: API key generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 apiKey:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     key:
 *                       type: string
 *                       description: The API key value. Only returned on creation.
 *                     name:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Name is required.
 *       401:
 *         description: Unauthorized.
 */
router.post('/user/generate-api-key', authenticate, async (req, res, next) => {
  const { name, expiresIn } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await auth.api.createApiKey({
      userId: req.userId,
      name,
      expiresIn: expiresIn || 31536000, // Default 1 year
    });

    res.status(201).json({
      message: 'API key generated successfully',
      apiKey: {
        id: result.id,
        key: result.key, // Only returned on creation
        name: result.name,
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /identity/user/api-key/{apiKeyId}:
 *   delete:
 *     summary: Delete an API key
 *     tags: [Identity & Security]
 *     description: Deletes a specific API key for the currently authenticated user.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: apiKeyId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the API key to delete.
 *     responses:
 *       200:
 *         description: API key deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: API key not found.
 */
router.delete('/user/api-key/:apiKeyId', authenticate, async (req, res, next) => {
  const { apiKeyId } = req.params;

  try {
    await auth.api.deleteApiKey({
      apiKeyId,
      userId: req.userId,
    });

    res.status(200).json({ message: 'API key deleted successfully.' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'API key not found.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /identity/user-api-keys:
 *   get:
 *     summary: Get the current user's API keys
 *     tags: [Identity & Security]
 *     description: Retrieves a list of API keys for the currently authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of API keys.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized.
 */
router.get('/user-api-keys', authenticate, async (req, res, next) => {
  try {
    const apiKeys = await auth.api.listApiKeys({
      userId: req.userId,
    });

    res.status(200).json(apiKeys);
  } catch (error) {
    next(error);
  }
});

module.exports = router;