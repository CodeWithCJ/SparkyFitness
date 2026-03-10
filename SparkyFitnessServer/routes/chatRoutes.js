const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const chatService = require('../services/chatService');
const globalSettingsRepository = require('../models/globalSettingsRepository');

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Process a chat message or save AI service settings
 *     tags: [AI & Insights]
 *     description: >
 *       Dual-purpose endpoint. When `action` is set to `save_ai_service_settings`, it persists
 *       user-specific AI service configuration. Otherwise it forwards the provided conversation
 *       messages to the configured AI service and returns the response. Per-user AI configuration
 *       must be enabled in global settings for saving to succeed, and users cannot create or
 *       modify public/global settings through this endpoint.
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
 *                 description: Conversation history to send to the AI service. Required when not saving settings.
 *                 items:
 *                   type: object
 *                   required:
 *                     - role
 *                     - content
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                       description: The role of the message author.
 *                     content:
 *                       type: string
 *                       description: The text content of the message.
 *               service_config_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the AI service configuration to use for processing chat messages.
 *               action:
 *                 type: string
 *                 enum: [save_ai_service_settings]
 *                 description: Set to `save_ai_service_settings` to save AI configuration instead of chatting.
 *               service_data:
 *                 type: object
 *                 description: AI service configuration to save. Required when `action` is `save_ai_service_settings`.
 *                 properties:
 *                   service_type:
 *                     type: string
 *                     description: The AI provider type (e.g., openai, anthropic, gemini, mistral, groq, ollama).
 *                   model_name:
 *                     type: string
 *                     description: The model identifier (e.g., gpt-4o, claude-3-opus).
 *                   api_url:
 *                     type: string
 *                     description: The API endpoint URL for the AI service.
 *                   api_key:
 *                     type: string
 *                     description: The API key for authenticating with the AI service.
 *                   is_active:
 *                     type: boolean
 *                     description: Whether this configuration should be the active one.
 *                   custom_system_prompt:
 *                     type: string
 *                     description: A custom system prompt to prepend to conversations.
 *     responses:
 *       200:
 *         description: Successful response. Returns AI-generated content for chat requests or a confirmation for settings saves.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Chat response.
 *                   properties:
 *                     content:
 *                       type: string
 *                       description: The AI-generated response text.
 *                 - type: object
 *                   description: Settings save response.
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: AI service settings saved successfully.
 *                     setting:
 *                       type: object
 *                       description: The saved AI service setting.
 *       400:
 *         description: Invalid message format, unsupported service type, or other validation error.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Per-user AI configuration is disabled, or attempted to create/modify public settings.
 *       404:
 *         description: AI service configuration not found or API key missing.
 *       500:
 *         description: Internal server error.
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
      
      // Only allow user-specific settings (not public)
      if (service_data && service_data.is_public) {
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
 *     summary: Clear old chat history
 *     tags: [AI & Insights]
 *     description: Removes stale chat history entries for the authenticated user. Only older entries are cleared; recent history is preserved.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Old chat history cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     summary: Get all AI service settings
 *     tags: [AI & Insights]
 *     description: >
 *       Retrieves all AI service settings visible to the authenticated user. If per-user AI
 *       configuration is disabled in global settings, only public/global settings are returned.
 *       Otherwise, both user-specific and public settings are included.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of AI service settings visible to the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     description: Unique identifier for the setting.
 *                   service_type:
 *                     type: string
 *                     description: The AI provider type (e.g., openai, anthropic, gemini, mistral, groq, ollama).
 *                   model_name:
 *                     type: string
 *                     description: The model identifier.
 *                   api_url:
 *                     type: string
 *                     description: The API endpoint URL.
 *                   is_active:
 *                     type: boolean
 *                     description: Whether this is the active configuration.
 *                   is_public:
 *                     type: boolean
 *                     description: Whether this is a global/public setting managed by an administrator.
 *                   custom_system_prompt:
 *                     type: string
 *                     description: A custom system prompt for conversations.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.get('/ai-service-settings', authenticate, async (req, res, next) => {
  try {
    const settings = await chatService.getAiServiceSettings(req.userId, req.userId);
    
    // If user AI config is disabled, only return global settings
    const isAllowed = await globalSettingsRepository.isUserAiConfigAllowed();
    if (!isAllowed) {
      const publicOnly = settings.filter(s => s.is_public);
      return res.status(200).json(publicOnly);
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
 *     summary: Get the active AI service setting
 *     tags: [AI & Insights]
 *     description: Retrieves the currently active AI service configuration for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The active AI service setting.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the setting.
 *                 service_type:
 *                   type: string
 *                   description: The AI provider type (e.g., openai, anthropic, gemini, mistral, groq, ollama).
 *                 model_name:
 *                   type: string
 *                   description: The model identifier.
 *                 api_url:
 *                   type: string
 *                   description: The API endpoint URL.
 *                 is_active:
 *                   type: boolean
 *                   description: Whether this is the active configuration.
 *                 is_public:
 *                   type: boolean
 *                   description: Whether this is a global/public setting.
 *                 custom_system_prompt:
 *                   type: string
 *                   description: A custom system prompt for conversations.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: No active AI service setting found for this user.
 *       500:
 *         description: Internal server error.
 */
router.get('/ai-service-settings/active', authenticate, async (req, res, next) => {
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
 *     description: >
 *       Deletes a user-specific AI service setting. Per-user AI configuration must be enabled
 *       in global settings. Public/global settings cannot be deleted through this endpoint;
 *       only administrators can manage those.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the AI service setting to delete.
 *     responses:
 *       200:
 *         description: AI service setting deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: AI service setting deleted successfully.
 *       400:
 *         description: AI service ID is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Per-user AI configuration is disabled, or attempted to delete a global setting.
 *       404:
 *         description: AI service setting not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/ai-service-settings/:id', authenticate, async (req, res, next) => {
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
    if (setting && setting.is_public) {
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
 *     summary: Get Sparky chat history
 *     tags: [AI & Insights]
 *     description: Retrieves the full Sparky chat history for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Array of chat history entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     description: Unique identifier for the history entry.
 *                   user_id:
 *                     type: string
 *                     format: uuid
 *                     description: The ID of the user who owns this entry.
 *                   content:
 *                     type: string
 *                     description: The message content.
 *                   messageType:
 *                     type: string
 *                     description: The type of message (e.g., user, assistant).
 *                   metadata:
 *                     type: object
 *                     description: Additional metadata associated with the entry.
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                     description: When the entry was created.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.get('/sparky-chat-history', authenticate, async (req, res, next) => {
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
 *     summary: Get a single chat history entry
 *     tags: [AI & Insights]
 *     description: Retrieves a single Sparky chat history entry by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the chat history entry.
 *     responses:
 *       200:
 *         description: The requested chat history entry.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the history entry.
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *                   description: The ID of the user who owns this entry.
 *                 content:
 *                   type: string
 *                   description: The message content.
 *                 messageType:
 *                   type: string
 *                   description: The type of message (e.g., user, assistant).
 *                 metadata:
 *                   type: object
 *                   description: Additional metadata associated with the entry.
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: When the entry was created.
 *       400:
 *         description: Chat history entry ID is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Chat history entry not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/sparky-chat-history/entry/:id', authenticate, async (req, res, next) => {
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
 *     summary: Update a chat history entry
 *     tags: [AI & Insights]
 *     description: Updates an existing Sparky chat history entry. Only the entry owner can perform this action.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the chat history entry to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The message content.
 *               messageType:
 *                 type: string
 *                 description: The type of message (e.g., user, assistant).
 *               metadata:
 *                 type: object
 *                 description: Additional metadata associated with the entry.
 *     responses:
 *       200:
 *         description: The updated chat history entry.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the history entry.
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *                   description: The ID of the user who owns this entry.
 *                 content:
 *                   type: string
 *                   description: The message content.
 *                 messageType:
 *                   type: string
 *                   description: The type of message (e.g., user, assistant).
 *                 metadata:
 *                   type: object
 *                   description: Additional metadata associated with the entry.
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: When the entry was created.
 *       400:
 *         description: Chat history entry ID is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Chat history entry not found or not authorized to update.
 *       500:
 *         description: Internal server error.
 */
router.put('/sparky-chat-history/:id', authenticate, async (req, res, next) => {
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
 *     summary: Delete a chat history entry
 *     tags: [AI & Insights]
 *     description: Deletes a single Sparky chat history entry by its ID. Only the entry owner can perform this action.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the chat history entry to delete.
 *     responses:
 *       200:
 *         description: Chat history entry deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Chat history entry deleted successfully.
 *       400:
 *         description: Chat history entry ID is required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Chat history entry not found or not authorized to delete.
 *       500:
 *         description: Internal server error.
 */
router.delete('/sparky-chat-history/:id', authenticate, async (req, res, next) => {
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
 *     summary: Clear all Sparky chat history
 *     tags: [AI & Insights]
 *     description: Deletes all Sparky chat history entries for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All chat history cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Confirmation message.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.post('/clear-all-history', authenticate, async (req, res, next) => {
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
 *     summary: Save a chat history entry
 *     tags: [AI & Insights]
 *     description: Persists a single Sparky chat history entry for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - messageType
 *             properties:
 *               content:
 *                 type: string
 *                 description: The message text to save.
 *               messageType:
 *                 type: string
 *                 description: Identifies the sender role or purpose of the message (e.g., user, assistant, system).
 *               metadata:
 *                 type: object
 *                 description: Optional metadata to associate with the entry (e.g., model info, token counts).
 *     responses:
 *       201:
 *         description: Chat history entry saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the saved entry.
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *                   description: The ID of the user who owns this entry.
 *                 content:
 *                   type: string
 *                   description: The message content.
 *                 messageType:
 *                   type: string
 *                   description: The type of message.
 *                 metadata:
 *                   type: object
 *                   description: Additional metadata associated with the entry.
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: When the entry was created.
 *       400:
 *         description: Content and message type are required.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.post('/save-history', authenticate, async (req, res, next) => {
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
 *     summary: Generate AI food nutrition options
 *     tags: [AI & Insights]
 *     description: >
 *       Uses the configured AI service to generate realistic food nutrition options
 *       for a given food name and unit. Returns a JSON string of food options with
 *       estimated nutritional information.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - service_config_id
 *             properties:
 *               foodName:
 *                 type: string
 *                 description: The name of the food to generate options for (e.g., "apple", "chicken breast").
 *               unit:
 *                 type: string
 *                 description: The unit of measurement for the food (e.g., "piece", "gram", "cup").
 *               service_config_id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the AI service configuration to use for generating options.
 *     responses:
 *       200:
 *         description: AI-generated food nutrition options.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: A JSON string containing the generated food options with estimated nutrition data.
 *       400:
 *         description: AI service configuration ID is required, or unsupported service type.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: AI service setting not found or API key missing.
 *       500:
 *         description: Internal server error.
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