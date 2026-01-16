const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const authService = require('../../services/authService');

/**
 * @swagger
 * /auth/user/generate-api-key:
 *   post:
 *     summary: Generate an API key for the current user
 *     tags: [Identity & Security]
 *     description: Creates a new API key for the currently authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: API key generated successfully.
 *       400:
 *         description: Invalid request body.
 *       403:
 *         description: User is not authorized to generate an API key.
 */
router.post('/user/generate-api-key', authenticate, async (req, res, next) => {
  const { description } = req.body;

  try {
    const apiKey = await authService.generateUserApiKey(req.userId, req.userId, description); // targetUserId is authenticatedUserId
    res.status(201).json({ message: 'API key generated successfully', apiKey });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/user/api-key/{apiKeyId}:
 *   delete:
 *     summary: Delete an API key
 *     tags: [Identity & Security]
 *     description: Deletes a specific API key for the currently authenticated user.
 *     parameters:
 *       - in: path
 *         name: apiKeyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: API key deleted successfully.
 *       403:
 *         description: User is not authorized to delete this API key.
 *       404:
 *         description: API key not found.
 */
router.delete('/user/api-key/:apiKeyId', authenticate, async (req, res, next) => {
  const { apiKeyId } = req.params;

  try {
    await authService.deleteUserApiKey(req.userId, req.userId, apiKeyId); // targetUserId is authenticatedUserId
    res.status(200).json({ message: 'API key deleted successfully.' });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'API Key not found or not authorized for deletion.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /auth/user-api-keys:
 *   get:
 *     summary: Get the current user's API keys
 *     tags: [Identity & Security]
 *     description: Retrieves a list of API keys for the currently authenticated user.
 *     responses:
 *       200:
 *         description: A list of API keys.
 *       403:
 *         description: User is not authorized to access these API keys.
 */
router.get('/user-api-keys', authenticate, async (req, res, next) => {
  try {
    const apiKeys = await authService.getUserApiKeys(req.userId, req.userId); // authenticatedUserId is targetUserId
    res.status(200).json(apiKeys);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;