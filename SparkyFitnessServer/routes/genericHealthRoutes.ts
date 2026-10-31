import express, { RequestHandler } from 'express';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import {
  type FlatHealthSample,
  type SampleWriteOptions,
  upsertSamplesByDay,
} from '../services/healthMetricSampleWriter.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  healthMetricSchema,
  healthMetricSamplesWriteBodySchema,
  addDays,
  compareDays,
  instantToDay,
} from '@workspace/shared';

const router = express.Router();
router.use(express.json());
// checkPermissionMiddleware('checkin') resolves GETs to 'checkin_read' (see
// checkPermissionMiddleware.ts), matching how fastingRoutes and moodRoutes guard
// read-only check-in data, and keeps 'checkin' for the one write route,
// POST /samples. The inline canAccessUserData calls below must use
// 'checkin_read' for the same reason: hardcoding 'checkin' there demanded write
// access and locked out delegates holding only can_view_reports or
// can_manage_diary.
router.use(checkPermissionMiddleware('checkin'));

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/health-data/metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getMetricsHandler: RequestHandler = async (req, res, next) => {
  try {
    const startDate =
      (req.query.startDate as string) || (req.query.date as string);
    const endDate = (req.query.endDate as string) || startDate;

    if (!startDate || !DATE_REGEX.test(startDate)) {
      res
        .status(400)
        .json({ error: 'Missing or invalid startDate (expected YYYY-MM-DD)' });
      return;
    }

    const queryUserId = req.query.userId as string | undefined;
    const targetUserId = queryUserId || req.userId;
    const actorUserId = req.originalUserId || req.userId;

    if (targetUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        targetUserId,
        'checkin_read',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const metrics = await genericHealthRepo.getDailyHealthMetrics(
      targetUserId,
      actorUserId,
      startDate,
      endDate
    );
    res.status(200).json({ data: metrics });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/health-data/samples?metric=heart_rate&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Replaces the former /heart-rate, /hrv, /respiration, /spo2 endpoints — all
 * four metrics now live in one table (health_metric_samples), one JSONB bucket
 * per day. See PLAN/telemetry_redesign_phase_3_server.md.
 */
const getHealthMetricSamplesHandler: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const metricResult = healthMetricSchema.safeParse(req.query.metric);
    if (!metricResult.success) {
      res.status(400).json({
        error: `Missing or invalid metric (expected one of: ${healthMetricSchema.options.join(', ')})`,
      });
      return;
    }

    const startDate =
      (req.query.startDate as string) || (req.query.date as string);
    const endDate = (req.query.endDate as string) || startDate;

    if (!startDate || !DATE_REGEX.test(startDate)) {
      res
        .status(400)
        .json({ error: 'Missing or invalid startDate (expected YYYY-MM-DD)' });
      return;
    }

    const targetUserId = (req.query.userId as string) || req.userId;
    const actorUserId = req.originalUserId || req.userId;

    if (targetUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        targetUserId,
        'checkin_read',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getHealthMetricSamples(
      targetUserId,
      actorUserId,
      metricResult.data,
      startDate,
      endDate
    );
    res.status(200).json({ data: entries });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /generic-health/samples:
 *   post:
 *     summary: Store passive health samples from an external source
 *     tags: [Wellness & Metrics]
 *     description: >-
 *       Stores all-day readings (heart rate, stress, SpO2 and the other
 *       sample metrics) from a source without a server-side integration, in
 *       the table GET /generic-health/samples reads. `merge` (default)
 *       requires `window` and replaces only this source's stored samples
 *       inside it; `replace` overwrites every day the samples touch. See
 *       docs/src/developer/api-reference.md for the field of each metric.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metric, source, samples]
 *             properties:
 *               metric:
 *                 type: string
 *                 enum: [heart_rate, hrv, respiration, spo2, stress, body_battery, skin_temperature]
 *               source:
 *                 type: string
 *                 maxLength: 64
 *               device_name:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [merge, replace]
 *                 default: merge
 *               window:
 *                 type: object
 *                 properties:
 *                   start: { type: string, format: date-time }
 *                   end: { type: string, format: date-time }
 *               samples:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [t]
 *                   properties:
 *                     t: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Samples stored; returns days and samples written.
 *       400:
 *         description: The body failed validation.
 *       403:
 *         description: No write permission for the active user, or a read-only API key.
 */
/**
 * POST /api/generic-health/samples
 *
 * Stores passive readings (all-day heart rate, stress, SpO2, ...) from a
 * source without a server-side integration, in the table GET /samples reads.
 * Each sample lands on the user's calendar day of its timestamp. `merge`
 * replaces only this source's stored samples inside `window`, so sending the
 * same window again replaces instead of duplicating.
 */
const postHealthMetricSamplesHandler: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const parsed = healthMetricSamplesWriteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Request body failed schema validation.',
        issues: parsed.error.issues,
      });
      return;
    }
    const body = parsed.data;
    const userId = req.userId;
    const actorUserId = req.originalUserId || req.userId;

    const tz = await loadUserTimezone(userId);
    const flatSamples: FlatHealthSample[] = body.samples.map(
      ({ t, ...fields }) => ({
        entry_date: instantToDay(t, tz),
        timestamp: new Date(t),
        device_name: body.device_name ?? null,
        ...fields,
      })
    );
    let options: SampleWriteOptions = { mode: 'replace' };
    if (body.mode === 'merge' && body.window) {
      // Every day the window touches, so a day whose readings are gone from
      // a resend is cleared too, not only the days that still have samples.
      const days: string[] = [];
      const lastDay = instantToDay(body.window.end, tz);
      for (
        let day = instantToDay(body.window.start, tz);
        compareDays(day, lastDay) <= 0;
        day = addDays(day, 1)
      ) {
        days.push(day);
      }
      options = {
        mode: 'merge',
        window: {
          startMs: Date.parse(body.window.start),
          endMs: Date.parse(body.window.end),
        },
        days,
      };
    }

    const daysWritten = await upsertSamplesByDay(
      userId,
      actorUserId,
      body.metric,
      body.source,
      flatSamples,
      options
    );
    res.status(200).json({
      metric: body.metric,
      source: body.source,
      mode: body.mode,
      days_written: daysWritten,
      samples_written: flatSamples.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/health-data/vitals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getVitalsHandler: RequestHandler = async (req, res, next) => {
  try {
    const startDate =
      (req.query.startDate as string) || (req.query.date as string);
    const endDate = (req.query.endDate as string) || startDate;

    if (!startDate || !DATE_REGEX.test(startDate)) {
      res
        .status(400)
        .json({ error: 'Missing or invalid startDate (expected YYYY-MM-DD)' });
      return;
    }

    const targetUserId = (req.query.userId as string) || req.userId;
    const actorUserId = req.originalUserId || req.userId;

    if (targetUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        targetUserId,
        'checkin_read',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getVitalsEntries(
      targetUserId,
      actorUserId,
      startDate,
      endDate
    );
    res.status(200).json({ data: entries });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/health-data/workout-laps/:exerciseEntryId
 */
const getWorkoutLapsHandler: RequestHandler = async (req, res, next) => {
  try {
    const exerciseEntryId = req.params.exerciseEntryId as string;
    const actorUserId = req.originalUserId || req.userId;

    if (!exerciseEntryId) {
      res.status(400).json({ error: 'Missing exerciseEntryId' });
      return;
    }

    const laps = await workoutTelemetryRepo.getLapsForExerciseEntry(
      exerciseEntryId,
      actorUserId
    );
    res.status(200).json({ data: laps });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/health-data/workout-gps/:exerciseEntryId
 *
 * Returns `{ data: ExerciseEntryGpsPoints | null }` — one row per workout
 * holding the whole track as `points`, not a list of point-rows.
 */
const getWorkoutGpsHandler: RequestHandler = async (req, res, next) => {
  try {
    const exerciseEntryId = req.params.exerciseEntryId as string;
    const actorUserId = req.originalUserId || req.userId;

    if (!exerciseEntryId) {
      res.status(400).json({ error: 'Missing exerciseEntryId' });
      return;
    }

    const points = await workoutTelemetryRepo.getGpsPointsForExerciseEntry(
      exerciseEntryId,
      actorUserId
    );
    res.status(200).json({ data: points });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/health-data/workout-hr-zones/:exerciseEntryId
 */
const getWorkoutHrZonesHandler: RequestHandler = async (req, res, next) => {
  try {
    const exerciseEntryId = req.params.exerciseEntryId as string;
    const actorUserId = req.originalUserId || req.userId;

    if (!exerciseEntryId) {
      res.status(400).json({ error: 'Missing exerciseEntryId' });
      return;
    }

    const zones = await workoutTelemetryRepo.getHrZonesForExerciseEntry(
      exerciseEntryId,
      actorUserId
    );
    res.status(200).json({ data: zones });
  } catch (error) {
    next(error);
  }
};

router.get('/metrics', getMetricsHandler);
router.get('/samples', getHealthMetricSamplesHandler);
router.post('/samples', postHealthMetricSamplesHandler);
router.get('/vitals', getVitalsHandler);
router.get('/workout-laps/:exerciseEntryId', getWorkoutLapsHandler);
router.get('/workout-gps/:exerciseEntryId', getWorkoutGpsHandler);
router.get('/workout-hr-zones/:exerciseEntryId', getWorkoutHrZonesHandler);

export default router;
