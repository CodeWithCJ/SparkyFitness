import express from 'express';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import mobileHealthDataRoutes from './mobileHealthDataRoutes.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { instantToDay } from '@workspace/shared';
import sleepRepository from '../../models/sleepRepository.js';
const router = express.Router();
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
    log('error', 'Received unexpected body format:', req.body);
    return res.status(400).json({
      error: 'Invalid request body format. Expected JSON object or array.',
    });
  }
  // Log the incoming health data JSON
  log(
    'info',
    'Incoming health data JSON:',
    JSON.stringify(healthDataArray, null, 2)
  );
  try {
    const result = await measurementService.processHealthData(
      healthDataArray,
      req.userId,
      req.userId
    );
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
      return res.status(400).json({
        error:
          'Missing required fields: bedtime, wake_time, or duration_in_seconds.',
      });
    }
    const tz = await loadUserTimezone(req.userId);
    const sleepEntryData = {
      entry_date: instantToDay(bedtime, tz), // Derive date from bedtime in user's timezone
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: duration_in_seconds,
      source: 'manual',
    };
    const result = await measurementService.processSleepEntry(
      req.userId,
      req.userId,
      sleepEntryData
    );
    res.status(200).json(result);
  } catch (error) {
    log('error', 'Error during manual sleep entry:', error);
    next(error);
  }
});
// Endpoint for fetching sleep entries (API Key authenticated)
router.get('/data/sleep_entries', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required query parameters: startDate and endDate.',
      });
    }
    const sleepEntries =
      await sleepRepository.getSleepEntriesByUserIdAndDateRange(
        req.userId,
        startDate,
        endDate
      );
    res.status(200).json(sleepEntries);
  } catch (error) {
    log('error', 'Error fetching sleep entries:', error);
    next(error);
  }
});
export default router;
