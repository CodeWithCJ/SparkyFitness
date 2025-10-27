const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const externalProviderService = require('../services/externalProviderService');
const { log } = require('../config/logging');

router.use(express.json());

// Get all external data providers for the authenticated user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const providers = await externalProviderService.getExternalDataProviders(req.userId);
    res.status(200).json(providers);
  } catch (error) {
    next(error);
  }
});

// Get external data providers for a specific user (with authorization)
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

// Create a new external data provider
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newProvider = await externalProviderService.createExternalDataProvider(req.userId, req.body);
    res.status(201).json(newProvider);
  } catch (error) {
    next(error);
  }
});

// Update an existing external data provider
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
 
// Delete an external data provider
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
 
// Get details of a specific external data provider
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

// Garmin Connect data handling
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