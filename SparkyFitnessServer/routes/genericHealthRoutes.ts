import express, { RequestHandler } from 'express';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { healthMetricSchema } from '@workspace/shared';

const router = express.Router();
router.use(express.json());
// Every route here is a GET, and checkPermissionMiddleware('checkin') already
// resolves GETs to 'checkin_read' (see checkPermissionMiddleware.ts), matching
// how fastingRoutes and moodRoutes guard read-only check-in data. The inline
// canAccessUserData calls below must use 'checkin_read' for the same reason:
// hardcoding 'checkin' there demanded write access and locked out delegates
// holding only can_view_reports or can_manage_diary.
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
router.get('/vitals', getVitalsHandler);
router.get('/workout-laps/:exerciseEntryId', getWorkoutLapsHandler);
router.get('/workout-gps/:exerciseEntryId', getWorkoutGpsHandler);
router.get('/workout-hr-zones/:exerciseEntryId', getWorkoutHrZonesHandler);

export default router;
