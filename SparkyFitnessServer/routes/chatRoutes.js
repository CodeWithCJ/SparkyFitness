const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const chatService = require('../services/chatService');
const globalSettingsRepository = require('../models/globalSettingsRepository');

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Process a chat message or save AI service settings
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *               service_config_id:
 *                 type: string
 *                 format: uuid
 *               action:
 *                 type: string
 *                 enum: [save_ai_service_settings]
 *               service_data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Successful response from the AI service or confirmation of settings save.
 *       400:
 *         description: Bad request.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.post('/', authenticate, async (req, res, next) => {
  const { messages, service_config_id, action, service_data } = req.body;

  try {
    if (action === 'save_ai_service_settings') {
      // Check if user AI config is allowed
      const isAllowed = await globalSettingsRepository.isUserAiConfigAllowed();
      if (!isAllowed) {
        return res.status(403).json({ 
          error: 'Per-user AI service configuration is disabled. Please use the global AI service settings configured by your administrator.' 
        });
      }
      
      // Only allow user-specific settings (not global)
      if (service_data && service_data.is_global) {
        return res.status(403).json({ 
          error: 'Only administrators can create or modify global AI service settings.' 
        });
      }
      
      const result = await chatService.handleAiServiceSettings(action, service_data, req.userId);
      return res.status(200).json(result);
    }

    const { content } = await chatService.processChatMessage(messages, service_config_id, req.userId);
    return res.status(200).json({ content });
  } catch (error) {
    if (error.message.startsWith('Invalid messages format') || error.message.startsWith('No valid content')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.startsWith('AI service configuration ID is missing')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('AI service setting not found') || error.message.startsWith('API key missing')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('Image analysis is not supported') || error.message.startsWith('Unsupported service type')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.startsWith('AI service API call error')) {
      const statusCodeMatch = error.message.match(/AI service API call error: (\d+) -/);
      const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/clear-old-history:
 *   post:
 *     summary: Clear old chat history for the authenticated user
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Confirmation of successful clearing.
 *       500:
 *         description: Server error.
 */
router.post('/clear-old-history', authenticate, async (req, res, next) => {
  try {
    const result = await chatService.clearOldChatHistory(req.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /chat/ai-service-settings:
 *   get:
 *     summary: Retrieve AI service settings for the authenticated user
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of AI service settings.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.get('/ai-service-settings', authenticate, authorize('ai_service_settings'), async (req, res, next) => {
  try {
    const settings = await chatService.getAiServiceSettings(req.userId, req.userId);
    
    // If user AI config is disabled, only return global settings
    const isAllowed = await globalSettingsRepository.isUserAiConfigAllowed();
    if (!isAllowed) {
      const globalOnly = settings.filter(s => s.is_global);
      return res.status(200).json(globalOnly);
    }
    
    res.status(200).json(settings);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/ai-service-settings/active:
 *   get:
 *     summary: Retrieve the active AI service setting for the authenticated user
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Active AI service setting.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.get('/ai-service-settings/active', authenticate, authorize('ai_service_settings'), async (req, res, next) => {
  try {
    const setting = await chatService.getActiveAiServiceSetting(req.userId, req.userId);
    res.status(200).json(setting);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'No active AI service setting found for this user.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/ai-service-settings/{id}:
 *   delete:
 *     summary: Delete an AI service setting
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       200:
 *         description: Confirmation of successful deletion.
 *       400:
 *         description: Bad request.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.delete('/ai-service-settings/:id', authenticate, authorize('ai_service_settings'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'AI Service ID is required.' });
  }
  try {
    // Check if user AI config is allowed
    const isAllowed = await globalSettingsRepository.isUserAiConfigAllowed();
    if (!isAllowed) {
      return res.status(403).json({ 
        error: 'Per-user AI service configuration is disabled. Please use the global AI service settings configured by your administrator.' 
      });
    }
    
    // Verify the setting is user-specific (not global) before deletion
    const settings = await chatService.getAiServiceSettings(req.userId, req.userId);
    const setting = settings.find(s => s.id === id);
    if (setting && setting.is_global) {
      return res.status(403).json({ 
        error: 'Only administrators can delete global AI service settings.' 
      });
    }
    
    const result = await chatService.deleteAiServiceSetting(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'AI service setting not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/sparky-chat-history:
 *   get:
 *     summary: Retrieve Sparky chat history for the authenticated user
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Chat history.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.get('/sparky-chat-history', authenticate, authorize('chat_history'), async (req, res, next) => {
  try {
    const history = await chatService.getSparkyChatHistory(req.userId, req.userId);
    res.status(200).json(history);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/sparky-chat-history/entry/{id}:
 *   get:
 *     summary: Retrieve a single Sparky chat history entry
 *     tags: [AI & Insights]
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
 *         description: Chat history entry.
 *       400:
 *         description: Bad request.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.get('/sparky-chat-history/entry/:id', authenticate, authorize('chat_history'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Chat History Entry ID is required.' });
  }
  try {
    const entry = await chatService.getSparkyChatHistoryEntry(req.userId, id);
    res.status(200).json(entry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Chat history entry not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/sparky-chat-history/{id}:
 *   put:
 *     summary: Update a Sparky chat history entry
 *     tags: [AI & Insights]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated chat history entry.
 *       400:
 *         description: Bad request.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.put('/sparky-chat-history/:id', authenticate, authorize('chat_history'), async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Chat History Entry ID is required.' });
  }
  try {
    const updatedEntry = await chatService.updateSparkyChatHistoryEntry(req.userId, id, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Chat history entry not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/sparky-chat-history/{id}:
 *   delete:
 *     summary: Delete a Sparky chat history entry
 *     tags: [AI & Insights]
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
 *         description: Confirmation of successful deletion.
 *       400:
 *         description: Bad request.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.delete('/sparky-chat-history/:id', authenticate, authorize('chat_history'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Chat History Entry ID is required.' });
  }
  try {
    const result = await chatService.deleteSparkyChatHistoryEntry(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Chat history entry not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/clear-all-history:
 *   post:
 *     summary: Clear all Sparky chat history for the authenticated user
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Confirmation of successful clearing.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.post('/clear-all-history', authenticate, authorize('chat_history'), async (req, res, next) => {
  try {
    const result = await chatService.clearAllSparkyChatHistory(req.userId);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/save-history:
 *   post:
 *     summary: Save a Sparky chat history entry
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               messageType:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Confirmation of successful saving.
 *       400:
 *         description: Bad request.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Server error.
 */
router.post('/save-history', authenticate, authorize('chat_history'), async (req, res, next) => {
  const { content, messageType, metadata } = req.body;
  if (!content || !messageType) {
    return res.status(400).json({ error: 'Content and message type are required.' });
  }
  try {
    const result = await chatService.saveSparkyChatHistory(req.userId, { user_id: req.userId, content, messageType, metadata });
    res.status(201).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /chat/food-options:
 *   post:
 *     summary: Generate food options for a given food name and unit
 *     tags: [AI & Insights]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               foodName:
 *                 type: string
 *               unit:
 *                 type: string
 *               service_config_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: List of food options generated by the AI service.
 *       400:
 *         description: Bad request.
 *       404:
 *         description: Not found.
 *       500:
 *         description: Server error.
 */
router.post('/food-options', authenticate, async (req, res, next) => {
  const { foodName, unit, service_config_id } = req.body;
  if (!service_config_id) {
    return res.status(400).json({ error: 'AI service configuration ID is required.' });
  }
  try {
    const { content } = await chatService.processFoodOptionsRequest(foodName, unit, req.userId, service_config_id);
    return res.status(200).json({ content });
  } catch (error) {
    if (error.message.startsWith('AI service configuration ID is missing')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.startsWith('AI service setting not found') || error.message.startsWith('API key missing')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.startsWith('AI service API call error')) {
      const statusCodeMatch = error.message.match(/AI service API call error: (\d+) -/);
      const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;