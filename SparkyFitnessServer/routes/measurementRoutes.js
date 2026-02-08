const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const measurementService = require('../services/measurementService');
const waterContainerRepository = require('../models/waterContainerRepository'); // Import waterContainerRepository
const { log } = require('../config/logging');


/**
 * @swagger
 * /measurements/health-data:
 *   post:
 *     summary: Submit health data via API Key
 *     tags: [Wellness & Metrics]
 *     description: Receives health data (e.g., from a mobile app) via an authorized API key.
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               description: Flexible health data object.
 *     responses:
 *       200:
 *         description: Health data processed successfully.
 *       400:
 *         description: Invalid JSON format.
 *       401:
 *         description: Unauthorized (missing or invalid API key).
 *       403:
 *         description: Forbidden (API key lacks write permission).
 */
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

/**
 * @swagger
 * /measurements/water-intake/{date}:
 *   get:
 *     summary: Get water intake for a date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Water intake data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WaterIntake'
 */
router.get('/water-intake/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.params;
  const { userId } = req.query;
  const targetUserId = userId || req.userId;

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  // Permission check if explicit userId is provided
  if (userId && userId !== req.userId) {
    const hasPermission = await require('../utils/permissionUtils').canAccessUserData(userId, 'diary', req.authenticatedUserId || req.userId); // Assuming diary permission covers water log
    if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const waterData = await measurementService.getWaterIntake(req.userId, targetUserId, date);
    res.status(200).json(waterData);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /measurements/water-intake:
 *   post:
 *     summary: Upsert water intake
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               change_drinks:
 *                 type: number
 *               container_id:
 *                 type: string
 *                 format: uuid
 *             required: [entry_date, change_drinks, container_id]
 *     responses:
 *       200:
 *         description: Water intake upserted successfully.
 */
router.post('/water-intake', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { entry_date, change_drinks, container_id, user_id } = req.body;
  if (!entry_date || change_drinks === undefined || container_id === undefined) {
    return res.status(400).json({ error: 'Entry date, change_drinks, and container_id are required.' });
  }

  const targetUserId = user_id || req.userId;

  // Check permission if explicitly management for another user
  if (user_id && user_id !== req.userId) {
    const hasPermission = await canAccessUserData(user_id, 'checkin', req.authenticatedUserId || req.userId); // Corrected to 'checkin'
    if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await measurementService.upsertWaterIntake(targetUserId, req.originalUserId || req.userId, entry_date, change_drinks, container_id);
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
 * /measurements/water-intake/entry/{id}:
 *   get:
 *     summary: Get a specific water intake entry by ID
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
 *         description: The water intake entry.
 */
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

/**
 * @swagger
 * /measurements/water-intake/{id}:
 *   put:
 *     summary: Update a water intake entry
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
 *             $ref: '#/components/schemas/WaterIntake'
 *     responses:
 *       200:
 *         description: Water intake entry updated successfully.
 */
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

/**
 * @swagger
 * /measurements/water-intake/{id}:
 *   delete:
 *     summary: Delete a water intake entry
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
 *         description: Water intake entry deleted successfully.
 */
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


/**
 * @swagger
 * /measurements/check-in:
 *   post:
 *     summary: Upsert check-in measurements
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               weight:
 *                 type: number
 *               body_fat_percentage:
 *                 type: number
 *               waist_circumference:
 *                 type: number
 *               # ... other measurement fields ...
 *             required: [entry_date]
 *     responses:
 *       200:
 *         description: Check-in measurements upserted successfully.
 */
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

/**
 * @swagger
 * /measurements/check-in/latest-on-or-before-date:
 *   get:
 *     summary: Get latest check-in measurements on or before a date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: The latest check-in measurements.
 */
router.get('/check-in/latest-on-or-before-date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }
  try {
    const measurement = await measurementService.getLatestCheckInMeasurementsOnOrBeforeDate(req.originalUserId || req.userId, req.userId, date);
    res.status(200).json(measurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /measurements/check-in/{date}:
 *   get:
 *     summary: Get check-in measurements for a specific date
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Check-in measurements for the date.
 *       500:
 *         description: Internal server error.
 */
router.get('/check-in/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { date } = req.params;
  const { userId } = req.query; // Check query param

  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  const targetUserId = userId || req.userId;

  // Permission check if explicit userId is provided
  if (userId && userId !== req.userId) {
    const hasPermission = await canAccessUserData(userId, 'checkin', req.authenticatedUserId || req.userId); // Corrected to 'checkin'
    if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const measurement = await measurementService.getCheckInMeasurements(req.originalUserId || req.userId, targetUserId, date);
    res.status(200).json(measurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /measurements/check-in/{id}:
 *   put:
 *     summary: Update a check-in measurement entry
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               # ... other measurement fields ...
 *             required: [entry_date]
 *     responses:
 *       200:
 *         description: Measurement updated successfully.
 */
router.put('/check-in/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const { id } = req.params;
  const { entry_date, ...updateData } = req.body;
  if (!entry_date) {
    return res.status(400).json({ error: 'Entry date is required.' });
  }

  try {
    const existingMeasurement = await measurementService.getCheckInMeasurements(req.userId, req.userId, entry_date);

    if (!existingMeasurement || existingMeasurement.id !== id) {
      return res.status(404).json({ error: 'Check-in measurement not found or not authorized to update.' });
    }

    const updatedMeasurement = await measurementService.updateCheckInMeasurements(req.userId, req.originalUserId || req.userId, entry_date, updateData);
    res.status(200).json(updatedMeasurement);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Check-in measurement not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /measurements/check-in/{id}:
 *   delete:
 *     summary: Delete a check-in measurement entry
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
 *         description: Measurement deleted successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-categories:
 *   get:
 *     summary: Get all custom measurement categories
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: A list of custom measurement categories.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CustomMeasurementCategory'
 */
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

/**
 * @swagger
 * /measurements/custom-categories:
 *   post:
 *     summary: Create a new custom measurement category
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomMeasurementCategory'
 *     responses:
 *       201:
 *         description: Custom category created successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-entries:
 *   post:
 *     summary: Upsert a custom measurement entry
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomMeasurementEntry'
 *     responses:
 *       201:
 *         description: Custom entry upserted successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-entries/{id}:
 *   delete:
 *     summary: Delete a custom measurement entry
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
 *         description: Entry deleted successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-categories/{id}:
 *   put:
 *     summary: Update a custom measurement category
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
 *             $ref: '#/components/schemas/CustomMeasurementCategory'
 *     responses:
 *       200:
 *         description: Category updated successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-categories/{id}:
 *   delete:
 *     summary: Delete a custom measurement category
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
 *         description: Category deleted successfully.
 */
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

/**
 * @swagger
 * /measurements/custom-entries:
 *   get:
 *     summary: Get custom measurement entries with filtering
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of custom measurement entries.
 */
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

/**
 * @swagger
 * /measurements/check-in-measurements-range/{startDate}/{endDate}:
 *   get:
 *     summary: Get check-in measurements within a date range
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: path
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of check-in measurements.
 */
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

/**
 * @swagger
 * /measurements/custom-measurements-range/{categoryId}/{startDate}/{endDate}:
 *   get:
 *     summary: Get custom measurements within a date range
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: path
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of custom measurements.
 */
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

/**
 * @swagger
 * /measurements/most-recent/{measurementType}:
 *   get:
 *     summary: Get most recent measurement of a specific type
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: measurementType
 *         required: true
 *         schema:
 *           type: string
 *         description: weight, steps, body_fat_percentage, etc.
 *     responses:
 *       200:
 *         description: The most recent measurement.
 */
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