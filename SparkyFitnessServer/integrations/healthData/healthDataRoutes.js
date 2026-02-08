const express = require('express');
const router = express.Router();
const { getClient, getSystemClient } = require('../../db/poolManager'); // Use getClient for database connections
const { log } = require('../../config/logging');
const measurementService = require('../../services/measurementService'); // Import the new service
const mobileHealthDataRoutes = require('./mobileHealthDataRoutes'); // Import the new mobile health data routes

const sleepRepository = require('../../models/sleepRepository'); // Import sleepRepository

// Mount the new mobile health data routes
router.use('/mobile_data', mobileHealthDataRoutes);

// Endpoint for receiving health data
router.post('/', async (req, res, next) => {
  let healthDataArray = [];

  // req.body should already be parsed as JSON by express.json() middleware in SparkyFitnessServer.js
  if (Array.isArray(req.body)) {
    healthDataArray = req.body;
  } else if (typeof req.body === 'object' && req.body !== null) {
    healthDataArray.push(req.body);
  } else {
    log('error', "Received unexpected body format:", req.body);
    return res.status(400).json({ error: "Invalid request body format. Expected JSON object or array." });
  }

  // Log the incoming health data JSON
  log('info', "Incoming health data JSON:", JSON.stringify(healthDataArray, null, 2));

  try {
    const result = await measurementService.processHealthData(healthDataArray, req.userId, req.userId);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.startsWith('{') && error.message.endsWith('}')) {
      const parsedError = JSON.parse(error.message);
      return res.status(400).json(parsedError);
    }
    next(error);
  }
});

// Endpoint for manual sleep entry (API Key authenticated)
router.post('/sleep/manual_entry', async (req, res, next) => {
  try {
    const { bedtime, wake_time, duration_in_seconds } = req.body;
    if (!bedtime || !wake_time || !duration_in_seconds) {
      return res.status(400).json({ error: "Missing required fields: bedtime, wake_time, or duration_in_seconds." });
    }

    const sleepEntryData = {
      entry_date: new Date(bedtime).toISOString().split('T')[0], // Derive date from bedtime
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: duration_in_seconds,
      source: 'manual'
    };

    const result = await measurementService.processSleepEntry(req.userId, req.userId, sleepEntryData);
    res.status(200).json(result);
  } catch (error) {
    log('error', "Error during manual sleep entry:", error);
    next(error);
  }
});

// Endpoint for fetching sleep entries (API Key authenticated)
router.get('/data/sleep_entries', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing required query parameters: startDate and endDate." });
    }

    const sleepEntries = await sleepRepository.getSleepEntriesByUserIdAndDateRange(req.userId, startDate, endDate);
    res.status(200).json(sleepEntries);
  } catch (error) {
    log('error', "Error fetching sleep entries:", error);
    next(error);
  }
});

module.exports = router;