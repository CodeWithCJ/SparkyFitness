const express = require('express');
const router = express.Router();
const { getClient, getSystemClient } = require('../../db/poolManager');
const { log } = require('../../config/logging');
const measurementService = require('../../services/measurementService');

// Endpoint for receiving mobile health data
router.post('/mobile_data', async (req, res, next) => {
  let mobileHealthDataArray = [];

  if (Array.isArray(req.body)) {
    mobileHealthDataArray = req.body;
  } else if (typeof req.body === 'object' && req.body !== null) {
    mobileHealthDataArray.push(req.body);
  } else {
    log('error', "Received unexpected body format for mobile health data:", req.body);
    return res.status(400).json({ error: "Invalid request body format. Expected JSON object or array." });
  }

  log('info', "Incoming mobile health data JSON:", JSON.stringify(mobileHealthDataArray, null, 2));

  try {
    const result = await measurementService.processMobileHealthData(mobileHealthDataArray, req.userId, req.userId);
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
