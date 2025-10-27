const express = require('express');
const router = express.Router();
const { getClient, getSystemClient } = require('../../db/poolManager'); // Use getClient for database connections
const { log } = require('../../config/logging');
const measurementService = require('../../services/measurementService'); // Import the new service

// Middleware to authenticate API key for health data submission
router.use('/', async (req, res, next) => {
  const apiKey = req.headers['authorization']?.split(' ')[1] || req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API Key" });
  }

  try {
    const client = await getSystemClient(); // Use system client for API key validation
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
    log('error', "Error during API Key authentication:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
});

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

module.exports = router;