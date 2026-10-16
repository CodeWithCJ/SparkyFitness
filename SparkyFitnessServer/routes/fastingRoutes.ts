import express from 'express';
import fastingRepository from '../models/fastingRepository.js';
import fastingPreferencesRepository from '../models/fastingPreferencesRepository.js';
import fastingAutoCalculationService from '../services/fastingAutoCalculationService.js';
import moodRepository from '../models/moodRepository.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  todayInZone,
  addDays,
  userFastingPreferencesMutatorSchema,
  clampStoredMoodValue,
} from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Wellness & Metrics
 *   description: Health metrics, weight tracking, measurements, sleep, mood, and fasting.
 */
router.use(authenticate);
// Fasting logs are check-in data (RLS uses the check-in policy). Guard every
// endpoint with the matching permission: GET maps to checkin_read (also allows
// can_view_reports), writes require can_manage_checkin.
router.use(checkPermissionMiddleware('checkin'));
// Get current active fast
/**
 * @swagger
 * /fasting/current:
 *   get:
 *     summary: Get current active fast
 *     tags: [Wellness & Metrics]
 *     description: Retrieves the currently active fast for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The active fast or null if none.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/current', async (req, res) => {
  const { userId } = req.query;

  const targetUserId = (userId as string) || req.userId;
  log('debug', `GET /current: Fetching fast for userId: ${targetUserId}`);
  try {
    const currentFast = await fastingRepository.getCurrentFast(targetUserId);
    if (currentFast) {
      return res.json(currentFast);
    }

    const tz = await loadUserTimezone(targetUserId);
    // If no manual fast is active, check if auto-calculation is enabled
    const autoFast = await fastingAutoCalculationService.getCurrentAutoFast(
      targetUserId,
      tz
    );
    res.json(autoFast || null);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching current fast: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch current fast' });
  }
});
// Start a new fast
/**
 * @swagger
 * /fasting/start:
 *   post:
 *     summary: Start a new fast
 *     tags: [Wellness & Metrics]
 *     description: Starts a new fasting period for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - start_time
 *               - fasting_type
 *             properties:
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: The start time of the fast.
 *               target_end_time:
 *                 type: string
 *                 format: date-time
 *                 description: The target end time of the fast.
 *               fasting_type:
 *                 type: string
 *                 description: The type of fast (e.g., "Intermittent Fasting").
 *     responses:
 *       201:
 *         description: Success starting fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       400:
 *         description: Validation error or active fast already exists.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/start', async (req, res) => {
  const userId = req.userId;
  const { start_time, target_end_time, fasting_type } = req.body;
  try {
    // Validation
    if (!start_time || !fasting_type) {
      return res
        .status(400)
        .json({ error: 'Start time and fasting type are required' });
    }
    // Check if there is already an active fast
    const activeFast = await fastingRepository.getCurrentFast(userId);
    if (activeFast) {
      return res.status(400).json({ error: 'There is already an active fast' });
    }
    const newFast = await fastingRepository.createFastingLog(
      userId,
      start_time,
      target_end_time,
      fasting_type
    );
    res.status(201).json(newFast);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error starting fast: ${error.message}`);
    res.status(500).json({ error: 'Failed to start fast' });
  }
});
/**
 * @swagger
 * /fasting/end:
 *   post:
 *     summary: End an active fast
 *     tags: [Wellness & Metrics]
 *     description: Ends an active fasting period, calculates duration, and optionally logs mood.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - end_time
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the fast to end.
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Optional start time to override.
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: The end time of the fast.
 *               mood:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: integer
 *                     description: Mood intensity on a 10-100 scale; see the MoodEntry schema for the band boundaries.
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Success ending fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Fast not found.
 *       500:
 *         description: Internal server error.
 */
// End an active fast
router.post('/end', async (req, res) => {
  const userId = req.userId;
  const { id, start_time, end_time, mood } = req.body; // mood: { value, notes }
  if (!id || !end_time) {
    return res.status(400).json({ error: 'Fast ID and end time are required' });
  }
  // The mood lands in the same 10-100 column `POST /api/mood` writes, so it is
  // brought into range the same way. Checked before either branch writes
  // anything, so a bad value cannot leave a fast half-ended. A mood with no
  // value logs nothing, rather than reaching the NOT NULL column as undefined.
  let storedMoodValue: number | null = null;
  if (mood && mood.value !== null && mood.value !== undefined) {
    storedMoodValue = clampStoredMoodValue(mood.value);
    if (storedMoodValue === null) {
      return res.status(400).json({ error: 'Mood value must be a number' });
    }
  }
  try {
    if (id === 'auto-current') {
      const tz = await loadUserTimezone(userId);
      const activeAuto = await fastingAutoCalculationService.getCurrentAutoFast(
        userId,
        tz
      );
      if (!activeAuto) {
        return res.status(404).json({ error: 'Fast not found' });
      }

      const startUsed = start_time || activeAuto.start_time;
      if (new Date(startUsed) > new Date(end_time)) {
        return res
          .status(400)
          .json({ error: 'start_time must be before end_time' });
      }

      if (storedMoodValue !== null) {
        await moodRepository.createOrUpdateMoodEntry(
          userId,
          storedMoodValue,
          mood.notes || '',
          end_time
        );
      }

      const durationMinutes = Math.max(
        0,
        Math.round(
          (new Date(end_time).getTime() - new Date(startUsed).getTime()) / 60000
        )
      );
      const targetEnd = activeAuto.target_end_time || null;
      const fastingType = activeAuto.fasting_type || '16:8';

      const completed = await fastingRepository.createCompletedFast(
        userId,
        startUsed,
        end_time,
        targetEnd,
        durationMinutes,
        fastingType
      );
      return res.json(completed);
    }

    const fast = await fastingRepository.getFastingById(id, userId);
    if (!fast) return res.status(404).json({ error: 'Fast not found' });
    const startUsed = start_time || fast.start_time;
    if (new Date(startUsed) > new Date(end_time)) {
      return res
        .status(400)
        .json({ error: 'start_time must be before end_time' });
    }
    if (storedMoodValue !== null) {
      await moodRepository.createOrUpdateMoodEntry(
        userId,
        storedMoodValue,
        mood.notes || '',
        end_time
      );
    }
    const durationMinutes = Math.max(
      0,
      Math.round(
        (new Date(end_time).getTime() - new Date(startUsed).getTime()) / 60000
      )
    );
    const updatedFast = await fastingRepository.endFast(
      fast.id,
      userId,
      end_time,
      durationMinutes,
      startUsed
    );
    res.json(updatedFast);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error ending fast: ${error.message}`);
    res.status(500).json({ error: 'Failed to end fast' });
  }
});

// Fasting Preferences
router.get('/preferences', async (req, res) => {
  const userId = req.userId;
  try {
    const prefs =
      await fastingPreferencesRepository.getFastingPreferences(userId);
    res.json(prefs);
  } catch (error) {
    log(
      'error',
      `Error fetching fasting preferences: ${(error as Error).message}`,
      error
    );
    res.status(500).json({ error: 'Failed to fetch fasting preferences' });
  }
});

router.put('/preferences', async (req, res) => {
  const userId = req.userId;
  const parsed = userFastingPreferencesMutatorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  try {
    const updated = await fastingPreferencesRepository.upsertFastingPreferences(
      userId,
      parsed.data
    );
    if (updated.auto_calculate) {
      const tz = await loadUserTimezone(userId);
      await fastingAutoCalculationService.syncCompletedAutoFasts(
        userId,
        tz,
        updated
      );
    }
    res.json(updated);
  } catch (error) {
    log(
      'error',
      `Error updating fasting preferences: ${(error as Error).message}`,
      error
    );
    res.status(500).json({ error: 'Failed to update fasting preferences' });
  }
});

// Auto-calculated Fasting History
router.get('/calculated', async (req, res) => {
  const userId = req.userId;
  const { startDate, endDate } = req.query;
  try {
    const tz = await loadUserTimezone(userId);
    const end = (endDate as string) || todayInZone(tz);
    const start = (startDate as string) || addDays(end, -30);
    const fasts =
      await fastingAutoCalculationService.getCalculatedFastingHistory(
        userId,
        start,
        end,
        tz
      );
    res.json(fasts);
  } catch (error) {
    log(
      'error',
      `Error calculating fasting history: ${(error as Error).message}`,
      error
    );
    res.status(500).json({ error: 'Failed to calculate fasting history' });
  }
});

// Update a fast (edit start/end times, etc)

/**
 * @swagger
 * /fasting/{id}:
 *   put:
 *     summary: Update an existing fast
 *     tags: [Wellness & Metrics]
 *     description: Updates the details of an existing fasting log.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the fast to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FastingLog'
 *     responses:
 *       200:
 *         description: Success updating fast.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Fast not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id', async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const updates = req.body;
  try {
    const fast = await fastingRepository.getFastingById(id, userId);
    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }

    const startUsed =
      updates.start_time !== undefined ? updates.start_time : fast.start_time;
    const endUsed =
      updates.end_time !== undefined ? updates.end_time : fast.end_time;

    if (startUsed && endUsed) {
      if (new Date(startUsed) > new Date(endUsed)) {
        return res
          .status(400)
          .json({ error: 'start_time must be before end_time' });
      }
      updates.duration_minutes = Math.round(
        (new Date(endUsed).getTime() - new Date(startUsed).getTime()) / 60000
      );
    } else if (updates.end_time === null) {
      updates.duration_minutes = null;
    }

    const updatedFast = await fastingRepository.updateFast(id, userId, updates);
    res.json(updatedFast);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error updating fast: ${error.message}`);
    res.status(500).json({ error: 'Failed to update fast' });
  }
});

// Delete a fast
/**
 * @swagger
 * /fasting/{id}:
 *   delete:
 *     summary: Delete a fasting log
 *     tags: [Wellness & Metrics]
 *     description: Deletes an existing fasting log.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the fast to delete.
 *     responses:
 *       200:
 *         description: Success deleting fast.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Fast not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  try {
    const deletedFast = await fastingRepository.deleteFastingLog(id, userId);
    if (!deletedFast) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    res.json({ message: 'Fast deleted successfully', deletedFast });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error deleting fast: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete fast' });
  }
});

// Get Fasting History
/**
 * @swagger
 * /fasting/history:
 *   get:
 *     summary: Get fasting history
 *     tags: [Wellness & Metrics]
 *     description: Retrieves a paginated history of fasting logs for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of records to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip.
 *     responses:
 *       200:
 *         description: A list of fasting logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/history', async (req, res) => {
  const userId = req.userId;
  log(
    'debug',
    `GET /history: Fetching history for userId: ${userId} with params:`,
    req.query
  );
  const { limit, offset } = req.query;
  try {
    const history = await fastingRepository.getFastingHistory(
      userId,
      // @ts-expect-error TS(2345): Argument of type 'string | ParsedQs | (string | Pa... Remove this comment to see the full error message
      limit,
      offset
    );
    res.json(history);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching fasting history: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});
// Get Stats
/**
 * @swagger
 * /fasting/stats:
 *   get:
 *     summary: Get fasting statistics
 *     tags: [Wellness & Metrics]
 *     description: Retrieves summary statistics for the user's fasting history.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Fasting statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_completed_fasts:
 *                   type: integer
 *                 total_minutes_fasted:
 *                   type: integer
 *                 average_duration_minutes:
 *                   type: number
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/stats', async (req, res) => {
  const userId = req.userId;
  log('debug', `GET /stats: Fetching stats for userId: ${userId}`);
  try {
    const stats = await fastingRepository.getFastingStats(userId);
    res.json(stats);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error fetching fasting stats: ${error.message}`, error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
// Get fasting logs within a date range
/**
 * @swagger
 * /fasting/history/range/{startDate}/{endDate}:
 *   get:
 *     summary: Get fasting logs by date range
 *     tags: [Wellness & Metrics]
 *     description: Retrieves completed fasting logs within a specified date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD).
 *       - in: path
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of fasting logs within the range.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FastingLog'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/history/range/:startDate/:endDate', async (req, res) => {
  const { startDate, endDate } = req.params;

  const userId = req.userId;
  log(
    'debug',
    `GET /history/range: start=${startDate}, end=${endDate}, userId=${userId}`
  );
  try {
    const tz = await loadUserTimezone(userId);
    const logs = await fastingRepository.getFastingLogsByDateRange(
      userId,
      startDate,
      endDate,
      tz
    );
    res.json(logs);
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error fetching fasting logs by range: ${error.message}`,
      error
    );
    res.status(500).json({ error: 'Failed to fetch fasting logs by range' });
  }
});

router.post('/sync', async (req, res) => {
  const userId = req.userId;
  try {
    const tz = await loadUserTimezone(userId);
    const syncedCount =
      await fastingAutoCalculationService.syncCompletedAutoFasts(userId, tz);
    res.json({ success: true, syncedCount });
  } catch (error) {
    log('error', `Error syncing fasts: ${(error as Error).message}`, error);
    res.status(500).json({ error: 'Failed to sync fasting logs' });
  }
});

export default router;
