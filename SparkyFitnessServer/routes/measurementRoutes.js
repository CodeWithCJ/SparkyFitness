const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware'); // Import the new middleware
const measurementService = require('../services/measurementService');
const waterContainerRepository = require('../models/waterContainerRepository'); // Import waterContainerRepository
const { log } = require('../config/logging');
const {
  UpsertWaterIntakeBodySchema,
  UpdateWaterIntakeBodySchema,
  UpsertCheckInBodySchema,
  UpdateCheckInBodySchema,
  CreateCustomCategoryBodySchema,
  UpdateCustomCategoryBodySchema,
  UpsertCustomEntryBodySchema,
  DateParamSchema,
  UuidParamSchema,
  DateRangeParamSchema,
  CustomMeasurementsRangeParamSchema,
} = require('../schemas/measurementSchemas');


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
 *         description: Date in YYYY-MM-DD format.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional user ID to fetch water intake for (requires diary permission).
 *     responses:
 *       200:
 *         description: Aggregated water intake for the date.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 water_ml:
 *                   type: number
 *                   description: Total water consumed in milliliters.
 *       400:
 *         description: Invalid date format.
 *       403:
 *         description: Forbidden.
 */
router.get('/water-intake/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = DateParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { date } = paramResult.data;
  const { userId } = req.query;
  const targetUserId = userId || req.userId;

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
 *                 description: Date in YYYY-MM-DD format.
 *               change_drinks:
 *                 type: number
 *                 description: Number of drinks to add (positive) or remove (negative).
 *               container_id:
 *                 type: number
 *                 nullable: true
 *                 description: The water container ID used for volume calculation.
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Optional target user ID (requires checkin permission).
 *             required: [entry_date, change_drinks, container_id]
 *     responses:
 *       200:
 *         description: Water intake upserted successfully.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 */
router.post('/water-intake', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const bodyResult = UpsertWaterIntakeBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  const { entry_date, change_drinks, container_id, user_id } = bodyResult.data;

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
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
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
 *             type: object
 *             properties:
 *               water_ml:
 *                 type: number
 *                 description: Water amount in milliliters.
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: Date in YYYY-MM-DD format.
 *               source:
 *                 type: string
 *                 description: Source of the water intake entry (e.g. manual, healthkit).
 *     responses:
 *       200:
 *         description: Water intake entry updated successfully.
 *       400:
 *         description: Validation error.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Water intake entry not found.
 */
router.put('/water-intake/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
  const bodyResult = UpdateWaterIntakeBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  const updateData = bodyResult.data;
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
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
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
 *                 description: Date in YYYY-MM-DD format.
 *               weight:
 *                 type: number
 *                 nullable: true
 *               neck:
 *                 type: number
 *                 nullable: true
 *               waist:
 *                 type: number
 *                 nullable: true
 *               hips:
 *                 type: number
 *                 nullable: true
 *               steps:
 *                 type: number
 *                 nullable: true
 *               height:
 *                 type: number
 *                 nullable: true
 *               body_fat_percentage:
 *                 type: number
 *                 nullable: true
 *             required: [entry_date]
 *     responses:
 *       200:
 *         description: Check-in measurements upserted successfully.
 *       400:
 *         description: Validation error.
 */
router.post('/check-in', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const bodyResult = UpsertCheckInBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  const { entry_date, ...measurements } = bodyResult.data;
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
  const queryResult = DateParamSchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: queryResult.error.issues.map(i => i.message).join(', ') });
  }
  const { date } = queryResult.data;
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
 *         description: Date in YYYY-MM-DD format.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional user ID to fetch measurements for (requires checkin permission).
 *     responses:
 *       200:
 *         description: Check-in measurements for the date.
 *       400:
 *         description: Invalid date format.
 *       403:
 *         description: Forbidden.
 */
router.get('/check-in/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = DateParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { date } = paramResult.data;
  const { userId } = req.query; // Check query param

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
 *                 description: Date in YYYY-MM-DD format.
 *               weight:
 *                 type: number
 *               neck:
 *                 type: number
 *               waist:
 *                 type: number
 *               hips:
 *                 type: number
 *               steps:
 *                 type: number
 *               height:
 *                 type: number
 *               body_fat_percentage:
 *                 type: number
 *             required: [entry_date]
 *     responses:
 *       200:
 *         description: Measurement updated successfully.
 *       400:
 *         description: Validation error or missing entry_date.
 *       404:
 *         description: Check-in measurement not found.
 */
router.put('/check-in/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
  const bodyResult = UpdateCheckInBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  const { entry_date, ...updateData } = bodyResult.data;
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
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
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
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               display_name:
 *                 type: string
 *                 nullable: true
 *               frequency:
 *                 type: string
 *                 description: Tracking frequency (e.g. daily, hourly).
 *               measurement_type:
 *                 type: string
 *               data_type:
 *                 type: string
 *                 nullable: true
 *                 description: Data type (e.g. numeric, boolean, text).
 *             required: [name, frequency, measurement_type]
 *     responses:
 *       201:
 *         description: Custom category created successfully.
 *       400:
 *         description: Validation error.
 */
router.post('/custom-categories', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const bodyResult = CreateCustomCategoryBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  try {
    const newCategory = await measurementService.createCustomCategory(req.userId, req.originalUserId || req.userId, { ...bodyResult.data, user_id: req.userId });
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
 *             type: object
 *             properties:
 *               category_id:
 *                 type: string
 *                 format: uuid
 *               value:
 *                 oneOf:
 *                   - type: number
 *                   - type: string
 *                 description: Measurement value (type depends on category data_type).
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: Date in YYYY-MM-DD format.
 *               entry_hour:
 *                 type: integer
 *                 nullable: true
 *                 description: Hour of day (0-23) for hourly measurements.
 *               entry_timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Full timestamp for the entry.
 *               notes:
 *                 type: string
 *               source:
 *                 type: string
 *                 description: Source of the entry (e.g. manual, healthkit).
 *             required: [category_id, value, entry_date]
 *     responses:
 *       201:
 *         description: Custom entry upserted successfully.
 *       400:
 *         description: Validation error.
 */
router.post('/custom-entries', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const bodyResult = UpsertCustomEntryBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  try {
    const newEntry = await measurementService.upsertCustomMeasurementEntry(req.userId, req.originalUserId || req.userId, bodyResult.data);
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
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
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
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               display_name:
 *                 type: string
 *                 nullable: true
 *               frequency:
 *                 type: string
 *               measurement_type:
 *                 type: string
 *               data_type:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Category updated successfully.
 *       400:
 *         description: Validation error.
 *       404:
 *         description: Custom category not found.
 */
router.put('/custom-categories/:id', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
  const bodyResult = UpdateCustomCategoryBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: bodyResult.error.issues.map(i => i.message).join(', ') });
  }
  const updateData = bodyResult.data;
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
  const paramResult = UuidParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { id } = paramResult.data;
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

/**
 * @swagger
 * /measurements/custom-entries/{date}:
 *   get:
 *     summary: Get custom measurement entries for a specific date
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
 *         description: Date in YYYY-MM-DD format.
 *     responses:
 *       200:
 *         description: List of custom measurement entries for the date.
 *       400:
 *         description: Invalid date format.
 */
router.get('/custom-entries/:date', authenticate, checkPermissionMiddleware('checkin'), async (req, res, next) => {
  const paramResult = DateParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { date } = paramResult.data;
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
  const paramResult = DateRangeParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { startDate, endDate } = paramResult.data;
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
  const paramResult = CustomMeasurementsRangeParamSchema.safeParse(req.params);
  if (!paramResult.success) {
    return res.status(400).json({ error: paramResult.error.issues.map(i => i.message).join(', ') });
  }
  const { categoryId, startDate, endDate } = paramResult.data;
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
