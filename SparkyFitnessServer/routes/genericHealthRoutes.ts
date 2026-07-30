import express, { RequestHandler } from 'express';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';

const router = express.Router();
router.use(express.json());
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
        'checkin',
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
 * GET /api/health-data/heart-rate?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getHeartRateHandler: RequestHandler = async (req, res, next) => {
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
        'checkin',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getHeartRateEntries(
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
 * GET /api/health-data/hrv?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getHrvHandler: RequestHandler = async (req, res, next) => {
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
        'checkin',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getHrvEntries(
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
 * GET /api/health-data/respiration?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getRespirationHandler: RequestHandler = async (req, res, next) => {
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
        'checkin',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getRespirationEntries(
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
 * GET /api/health-data/spo2?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getSpo2Handler: RequestHandler = async (req, res, next) => {
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
        'checkin',
        actorUserId
      );
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const entries = await genericHealthRepo.getSpo2Entries(
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
        'checkin',
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

router.get('/metrics', getMetricsHandler);
router.get('/heart-rate', getHeartRateHandler);
router.get('/hrv', getHrvHandler);
router.get('/respiration', getRespirationHandler);
router.get('/spo2', getSpo2Handler);
router.get('/vitals', getVitalsHandler);
router.get('/workout-laps/:exerciseEntryId', getWorkoutLapsHandler);
router.get('/workout-gps/:exerciseEntryId', getWorkoutGpsHandler);

export default router;
