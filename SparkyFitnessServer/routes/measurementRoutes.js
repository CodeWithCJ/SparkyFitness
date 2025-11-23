const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const measurementService = require('../services/measurementService');
const waterContainerRepository = require('../models/waterContainerRepository'); // Import waterContainerRepository
const { log } = require('../config/logging');

// Middleware to authenticate API key for health data submission
router.use('/health-data', async (req, res, next) => {
  const apiKey = req.headers['authorization']?.split(' ')[1] || req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API Key" });
  }

  try {
    const client = await pool.connect(); // Need pool here for API key validation
    const result = await client.query(
      'SELECT user_id, permissions FROM user_api_keys WHERE api_key = $1 AND is_active = TRUE',
      [apiKey]
    );
    client.release();

    const data = result.rows[0];

    if (!data) {
      log('error', "API Key validation error: No data found for API key.");
      return res.status(401).json({ error: "Unauthorized: Invalid or inactive API Key" });
    }

    if (!data.permissions || !data.permissions.health_data_write) {
      return res.status(403).json({ error: "Forbidden: API Key does not have health_data_write permission" });
    }

    req.userId = data.user_id;
    req.permissions = data.permissions;
    next();
  } catch (error) {
    next(error);
  }
});

// New endpoint for receiving health data
router.post('/health-data', express.text({ type: '*/*' }), async (req, res, next) => {
  const rawBody = req.body;
  let healthDataArray = [];

  if (rawBody.startsWith('[') && rawBody.endsWith(']')) {
    try {
      healthDataArray = JSON.parse(rawBody);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON array format." });
    }
  } else if (rawBody.includes('}{')) {
    const jsonStrings = rawBody.split('}{').map((part, index, arr) => {
      if (index === 0) return part + '}';
      if (index === arr.length - 1) return '{' + part;
      return '{' + part + '}';
    });
    for (const jsonStr of jsonStrings) {
      try {
        healthDataArray.push(JSON.parse(jsonStr));
      } catch (parseError) {
        log('error', "Error parsing individual concatenated JSON string:", jsonStr, parseError);
      }
    }
  } else {
    try {
      healthDataArray.push(JSON.parse(rawBody));
    } catch (e) {
      return res.status(400).json({ error: "Invalid single JSON format." });
    }
  }

  try {
    const result = await measurementService.processHealthData(healthDataArray, req.userId, req.originalUserId || req.userId);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('{') && error.message.endsWith('}')) {
      const parsedError = JSON.parse(error.message);
      return res.status(400).json(parsedError);
    }
    next(error);
  }
});

// Endpoint to fetch water intake for a specific user and date
router.get('/water-intake/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.params;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  try {
    const waterData = await measurementService.getWaterIntake(req.userId, req.userId, date);
    res.status(200).json(waterData);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to upsert water intake
router.post('/water-intake', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { entry_date, change_drinks, container_id } = req.body;
  if (!entry_date || change_drinks === undefined || container_id === undefined) {
    return res.status(400).json({ error: 'Entry date, change_drinks, and container_id are required.' });
  }
 
  try {
    const result = await measurementService.upsertWaterIntake(req.userId, req.originalUserId || req.userId, entry_date, change_drinks, container_id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch water intake by ID
router.get('/water-intake/entry/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Water Intake Entry ID is required.' });
  }
  try {
    const entry = await measurementService.getWaterIntakeEntryById(req.userId, id);
    res.status(200).json(entry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Water intake entry not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to update water intake
router.put('/water-intake/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Water Intake Entry ID is required.' });
  }
  try {
    const updatedEntry = await measurementService.updateWaterIntake(req.userId, id, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Water intake entry not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to delete water intake
router.delete('/water-intake/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Water Intake Entry ID is required.' });
  }
  try {
    const result = await measurementService.deleteWaterIntake(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Water intake entry not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});


// Endpoint to upsert check-in measurements
router.post('/check-in', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { entry_date, ...measurements } = req.body;
  if (!entry_date) {
    return res.status(400).json({ error: 'Entry date is required.' });
  }
  try {
    const result = await measurementService.upsertCheckInMeasurements(req.userId, req.originalUserId || req.userId, entry_date, measurements);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch the latest check-in measurements on or before a specific date
router.get('/check-in/latest-on-or-before-date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  try {
    const measurement = await measurementService.getLatestCheckInMeasurementsOnOrBeforeDate(req.userId, req.userId, date);
    res.status(200).json(measurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch check-in measurements for a specific user and date
router.get('/check-in/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.params;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  try {
    const measurement = await measurementService.getCheckInMeasurements(req.userId, req.userId, date);
    res.status(200).json(measurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to update check-in measurements
router.put('/check-in/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params; // Keep 'id' for route matching, but it's not used for lookup in service
  const { entry_date, ...updateData } = req.body;
  if (!entry_date) {
    return res.status(400).json({ error: 'Entry date is required.' });
  }

  try {
    // Perform authorization check directly in the route handler
    // Fetch the existing measurement to verify ownership
    const existingMeasurement = await measurementService.getCheckInMeasurements(req.userId, req.userId, entry_date);

    if (!existingMeasurement || existingMeasurement.id !== id) {
      // If no existing measurement for the user and date, or ID mismatch
      return res.status(404).json({ error: 'Check-in measurement not found or not authorized to update.' });
    }

    // If ownership is confirmed, proceed with the update
    const updatedMeasurement = await measurementService.updateCheckInMeasurements(req.userId, req.originalUserId || req.userId, entry_date, updateData);
    res.status(200).json(updatedMeasurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    // Catch specific error from service layer if measurement not found
    if (error.message === 'Check-in measurement not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to delete check-in measurements
router.delete('/check-in/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Check-in Measurement ID is required.' });
  }
  try {
    const result = await measurementService.deleteCheckInMeasurements(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Check-in measurement not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch custom categories for a user
router.get('/custom-categories', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const categories = await measurementService.getCustomCategories(req.userId, req.userId);
    res.status(200).json(categories);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to create a new custom category
router.post('/custom-categories', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const newCategory = await measurementService.createCustomCategory(req.userId, req.originalUserId || req.userId, { ...req.body, user_id: req.userId });
    res.status(201).json(newCategory);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to upsert a custom measurement entry
router.post('/custom-entries', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  try {
    const { source, ...restOfBody } = req.body; // Extract source from body
    const newEntry = await measurementService.upsertCustomMeasurementEntry(req.userId, req.originalUserId || req.userId, { ...restOfBody, source });
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to delete a custom measurement entry
router.delete('/custom-entries/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Custom Measurement Entry ID is required.' });
  }
  try {
    const result = await measurementService.deleteCustomMeasurementEntry(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Custom measurement entry not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to update a custom category
router.put('/custom-categories/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Category ID is required.' });
  }
  try {
    const updatedCategory = await measurementService.updateCustomCategory(req.userId, id, updateData);
    res.status(200).json(updatedCategory);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Custom category not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to delete a custom category
router.delete('/custom-categories/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Category ID is required.' });
  }
  try {
    const result = await measurementService.deleteCustomCategory(req.userId, id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Custom category not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch custom measurement entries for a specific user and date
router.get('/custom-entries/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.params;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  try {
    const entries = await measurementService.getCustomMeasurementEntriesByDate(req.userId, req.userId, date);
    res.status(200).json(entries);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch custom measurement entries
router.get('/custom-entries', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { limit, orderBy, filter, category_id } = req.query; // Extract category_id
  try {
    const entries = await measurementService.getCustomMeasurementEntries(req.userId, limit, orderBy, { ...filter, category_id }); // Pass category_id in filter object
    res.status(200).json(entries);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch check-in measurements for a specific user and date range
router.get('/check-in-measurements-range/:startDate/:endDate', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { startDate, endDate } = req.params;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required.' });
  }
  try {
    const measurements = await measurementService.getCheckInMeasurementsByDateRange(req.userId, req.userId, startDate, endDate);
    res.status(200).json(measurements);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

// Endpoint to fetch custom measurements for a specific user, category, and date range
router.get('/custom-measurements-range/:categoryId/:startDate/:endDate', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { categoryId, startDate, endDate } = req.params;
  if (!categoryId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Category ID, start date, and end date are required.' });
  }
  try {
    const measurements = await measurementService.getCustomMeasurementsByDateRange(req.userId, req.userId, categoryId, startDate, endDate);
    res.status(200).json(measurements);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/most-recent/:measurementType', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { measurementType } = req.params;
  try {
    const measurement = await measurementService.getMostRecentMeasurement(req.userId, measurementType);
    res.status(200).json(measurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;