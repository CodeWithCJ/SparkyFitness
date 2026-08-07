import express from 'express';
import { isLogLevelEnabled, log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { instantToDay } from '@workspace/shared';
import sleepRepository from '../../models/sleepRepository.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
const router = express.Router();
// Endpoint for receiving health data
router.post('/', checkPermissionMiddleware('diary'), async (req, res, next) => {
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
  if (
    healthDataArray.some(
      (item: unknown) => typeof item !== 'object' || item === null
    )
  ) {
    return res.status(400).json({
      error:
        'Invalid health data format. All entries must be non-null objects.',
    });
  }
  const recordTypes = [
    ...new Set(
      healthDataArray.map((item: Record<string, unknown>) =>
        typeof item.type === 'string' ? item.type : 'unknown'
      )
    ),
  ];
  log(
    'info',
    `Incoming health data: ${healthDataArray.length} record(s), types: ${recordTypes.join(', ')}`
  );
  // A workout sync carries a full GPS track and heart-rate series, so the
  // stringify is guarded rather than passed as an argument: arguments are
  // evaluated before log() gets to drop them.
  if (isLogLevelEnabled('debug')) {
    log(
      'debug',
      'Incoming health data JSON:',
      JSON.stringify(healthDataArray, null, 2)
    );
  }
  try {
    // Backwards compatibility (issue #1903): clients on the seconds-based set
    // model send X-Workout-Model-Version: 2 (or higher). Older clients omit the
    // header and send per-set duration in minutes.
    const workoutModelVersion =
      Number(req.header('x-workout-model-version')) || 1;
    const result = await measurementService.processHealthData(
      healthDataArray,

      req.userId,

      req.userId,
      { legacyWorkoutSetMinutes: workoutModelVersion < 2 }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
// Endpoint for manual sleep entry (API Key authenticated)
router.post(
  '/sleep/manual_entry',
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
    try {
      const {
        bedtime,
        wake_time,
        duration_in_seconds,
        record_timezone,
        record_utc_offset_minutes,
      } = req.body;
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
        record_timezone: record_timezone,
        record_utc_offset_minutes: record_utc_offset_minutes,
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
  }
);
// Endpoint for fetching sleep entries (API Key authenticated)
router.get(
  '/data/sleep_entries',
  checkPermissionMiddleware('diary'),
  async (req, res, next) => {
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
  }
);
export default router;
