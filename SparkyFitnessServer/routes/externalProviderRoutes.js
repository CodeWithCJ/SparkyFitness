const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const externalProviderService = require('../services/externalProviderService');
const { log } = require('../config/logging');

router.use(express.json());

/**
 * @swagger
 * tags:
 *   name: External Integrations
 *   description: Third-party service connections (Garmin, Withings, Oura, etc.).
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ExternalProvider:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The unique identifier for the external provider.
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: The ID of the user who owns this provider configuration.
 *         provider_name:
 *           type: string
 *           description: The name of the external provider (e.g., "Garmin", "Withings").
 *         provider_type:
 *           type: string
 *           description: The type of the external provider (e.g., "health", "fitness").
 *         client_id:
 *           type: string
 *           description: The client ID for API access.
 *         client_secret:
 *           type: string
 *           description: The client secret for API access.
 *         access_token:
 *           type: string
 *           description: The access token for API access.
 *         refresh_token:
 *           type: string
 *           description: The refresh token for API access.
 *         expires_at:
 *           type: string
 *           format: date-time
 *           description: The expiration date and time of the access token.
 *         scope:
 *           type: string
 *           description: The granted API scopes.
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the provider was configured.
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: The date and time when the provider was last updated.
 *       required:
 *         - user_id
 *         - provider_name
 *         - provider_type
 */

/**
 * @swagger
 * /external-providers:
 *   get:
 *     summary: Get all external data providers for the authenticated user
 *     tags: [External Integrations]
 *     description: Retrieves a list of all external data providers configured by the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of external data providers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExternalProvider'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to fetch external data providers.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const providers = await externalProviderService.getExternalDataProviders(req.userId);
    res.status(200).json(providers);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /external-providers/user/{targetUserId}:
 *   get:
 *     summary: Get external data providers for a specific user
 *     tags: [External Integrations]
 *     description: Retrieves external data providers for a specified user. Requires appropriate authorization.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user whose providers are to be retrieved.
 *     responses:
 *       200:
 *         description: A list of external data providers for the target user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExternalProvider'
 *       400:
 *         description: Missing target user ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, user does not have permission to access this resource.
 *       500:
 *         description: Failed to fetch external data providers.
 */
router.get('/user/:targetUserId', authenticate, async (req, res, next) => {
  const { targetUserId } = req.params;
  if (!targetUserId) {
    return res.status(400).json({ error: "Missing target user ID" });
  }
  try {
    const providers = await externalProviderService.getExternalDataProvidersForUser(req.userId, targetUserId);
    res.status(200).json(providers);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /external-providers:
 *   post:
 *     summary: Create a new external data provider
 *     tags: [External Integrations]
 *     description: Creates a new external data provider configuration for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider_name
 *               - provider_type
 *             properties:
 *               provider_name:
 *                 type: string
 *                 description: The name of the external provider (e.g., "Garmin").
 *               provider_type:
 *                 type: string
 *                 description: The type of the external provider (e.g., "health", "fitness").
 *               client_id:
 *                 type: string
 *                 description: The client ID for API access.
 *               client_secret:
 *                 type: string
 *                 description: The client secret for API access.
 *               access_token:
 *                 type: string
 *                 description: The access token for API access.
 *               refresh_token:
 *                 type: string
 *                 description: The refresh token for API access.
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *                 description: The expiration date and time of the access token.
 *               scope:
 *                 type: string
 *                 description: The granted API scopes.
 *     responses:
 *       201:
 *         description: The new external data provider was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExternalProvider'
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Failed to create external data provider.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newProvider = await externalProviderService.createExternalDataProvider(req.userId, req.body);
    res.status(201).json(newProvider);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /external-providers/{id}:
 *   put:
 *     summary: Update an existing external data provider
 *     tags: [External Integrations]
 *     description: Updates an existing external data provider configuration.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the external provider to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider_name:
 *                 type: string
 *                 description: The name of the external provider (e.g., "Garmin").
 *               provider_type:
 *                 type: string
 *                 description: The type of the external provider (e.g., "health", "fitness").
 *               client_id:
 *                 type: string
 *                 description: The client ID for API access.
 *               client_secret:
 *                 type: string
 *                 description: The client secret for API access.
 *               access_token:
 *                 type: string
 *                 description: The access token for API access.
 *               refresh_token:
 *                 type: string
 *                 description: The refresh token for API access.
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *                 description: The expiration date and time of the access token.
 *               scope:
 *                 type: string
 *                 description: The granted API scopes.
 *     responses:
 *       200:
 *         description: The external data provider was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExternalProvider'
 *       400:
 *         description: Provider ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, user does not have permission to update this provider.
 *       404:
 *         description: External data provider not found.
 *       500:
 *         description: Failed to update external data provider.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Provider ID is required.' });
  }
  try {
    const updatedProvider = await externalProviderService.updateExternalDataProvider(req.userId, id, req.body);
    res.status(200).json(updatedProvider);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'External data provider not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /external-providers/{id}:
 *   delete:
 *     summary: Delete an external data provider
 *     tags: [External Integrations]
 *     description: Deletes a specific external data provider configuration.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the external provider to delete.
 *     responses:
 *       200:
 *         description: External data provider deleted successfully.
 *       400:
 *         description: Provider ID is required.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, user does not have permission to delete this provider.
 *       404:
 *         description: External data provider not found.
 *       500:
 *         description: Failed to delete external data provider.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Provider ID is required.' });
  }
  try {
    await externalProviderService.deleteExternalDataProvider(req.userId, id);
    res.status(200).json({ message: 'External data provider deleted successfully.' });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'External data provider not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /external-providers/{id}:
 *   get:
 *     summary: Get details of a specific external data provider
 *     tags: [External Integrations]
 *     description: Retrieves the details of a specific external data provider by its ID.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the external provider to retrieve details for.
 *     responses:
 *       200:
 *         description: Details of the external data provider.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExternalProvider'
 *       400:
 *         description: Missing provider ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, user does not have permission to access this resource.
 *       500:
 *         description: Failed to fetch external data provider details.
 */
router.get('/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Missing provider ID" });
  }
  try {
    const providerDetails = await externalProviderService.getExternalDataProviderDetails(req.userId, id);
    res.status(200).json(providerDetails);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /external-providers/garmin/activities-and-workouts:
 *   post:
 *     summary: Process Garmin activities and workouts
 *     tags: [External Integrations]
 *     description: Endpoint for the Garmin microservice to send activity and workout data for processing.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Garmin activity and workout data.
 *             example:
 *               activities: []
 *               workouts: []
 *     responses:
 *       200:
 *         description: Data processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Error processing Garmin data.
 */
router.post('/garmin/activities-and-workouts', authenticate, async (req, res, next) => {
  try {
    const { userId } = req;
    const data = req.body;

    log('info', `Received data from Garmin microservice for user ${userId}.`);

    // Pass the data to the service layer for processing
    const result = await externalProviderService.processGarminActivitiesAndWorkouts(userId, data);

    res.status(200).json({ message: 'Data processed successfully.', result });
  } catch (error) {
    log('error', `Error processing Garmin data: ${error.message}`, { error: error.stack });
    next(error);
  }
});
module.exports = router;
