import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import exerciseStatsService from '../services/exerciseStatsService.js';
import {
  exerciseStatsSummaryQuerySchema,
  exerciseActivityQueryRequestSchema,
} from '@workspace/shared';

const router = express.Router();

const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/**
 * Resolves the documented `unitSystem` enum, defaulting to metric when absent.
 * Returns null for anything else so the route can answer 400 rather than
 * silently formatting an unrecognised value as metric — a caller that
 * misspells "imperial" should be told, not handed the wrong units.
 */
function parseUnitSystem(raw: unknown): UnitSystem | null {
  if (raw === undefined) return 'metric';
  return typeof raw === 'string' && UNIT_SYSTEMS.includes(raw as UnitSystem)
    ? (raw as UnitSystem)
    : null;
}

const INVALID_UNIT_SYSTEM_ERROR =
  "Invalid unitSystem. Expected 'metric' or 'imperial'.";

/**
 * @swagger
 * /exercise-stats/summary:
 *   get:
 *     summary: Get multi-interval exercise totals, trends, and period-over-period comparison
 *     tags: [Exercise Stats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { userId, ...queryParams } = req.query;
    const targetUserId = (userId as string) || req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }

    if (userId && userId !== req.userId) {
      const hasPermission = await canAccessUserData(
        userId as string,
        'reports',
        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to view stats for this user.',
        });
      }
    }

    const parsedQuery = exerciseStatsSummaryQuerySchema.parse(queryParams);
    const summary = await exerciseStatsService.getExerciseStatsSummary(
      targetUserId,
      parsedQuery
    );

    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercise-stats/query:
 *   post:
 *     summary: Interrogate and filter activities (e.g. query all Half Marathons by distance/pace/date)
 *     tags: [Exercise Stats]
 *     security:
 *       - cookieAuth: []
 */
router.post('/query', authenticate, async (req, res, next) => {
  try {
    const targetUserId = req.body.userId || req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }

    if (req.body.userId && req.body.userId !== req.userId) {
      const hasPermission = await canAccessUserData(
        req.body.userId,
        'reports',
        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to query activities for this user.',
        });
      }
    }

    const parsedBody = exerciseActivityQueryRequestSchema.parse(req.body);
    const queryResults = await exerciseStatsService.queryExerciseActivities(
      targetUserId,
      parsedBody
    );

    res.status(200).json(queryResults);
  } catch (error) {
    next(error);
  }
});

/**
 * Convenience GET endpoint for query activity interrogation
 */
router.get('/query', authenticate, async (req, res, next) => {
  try {
    const {
      userId,
      page,
      pageSize,
      distanceMinMeters,
      distanceMaxMeters,
      ...otherQuery
    } = req.query;
    const targetUserId = (userId as string) || req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }

    if (userId && userId !== req.userId) {
      const hasPermission = await canAccessUserData(
        userId as string,
        'reports',
        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to query activities for this user.',
        });
      }
    }

    const parsedQuery = exerciseActivityQueryRequestSchema.parse({
      ...otherQuery,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
      distanceMinMeters: distanceMinMeters
        ? parseFloat(distanceMinMeters as string)
        : undefined,
      distanceMaxMeters: distanceMaxMeters
        ? parseFloat(distanceMaxMeters as string)
        : undefined,
    });

    const queryResults = await exerciseStatsService.queryExerciseActivities(
      targetUserId,
      parsedQuery
    );

    res.status(200).json(queryResults);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercise-stats/prs:
 *   get:
 *     summary: Get personal records (PRs) matrix across distance milestones and 1RMs
 *     description: >
 *       Returns one cardio record per (sportGroup, distance standard) pair.
 *       sportGroup is the record boundary, so a hike and a walk compete for the
 *       same walk record, while sport describes the winning activity itself.
 *       Records are only comparable within a sportGroup — a 1 km walk is slower
 *       than a 1 mile run — so group by sportGroup rather than render a flat list.
 *     tags: [Exercise Stats]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *         description: Target user; defaults to the authenticated user. Requires reports permission for anyone else.
 *       - in: query
 *         name: unitSystem
 *         schema: { type: string, enum: [metric, imperial], default: metric }
 *         description: Controls distance and pace formatting in the response.
 *     responses:
 *       200:
 *         description: Personal records matrix.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExercisePRMatrixResponse'
 *       400:
 *         description: Target User ID is required, or unitSystem is not metric/imperial.
 *       403:
 *         description: Forbidden — no reports permission for the requested user.
 */
router.get('/prs', authenticate, async (req, res, next) => {
  try {
    const targetUserId = (req.query.userId as string) || req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }

    if (req.query.userId && req.query.userId !== req.userId) {
      const hasPermission = await canAccessUserData(
        req.query.userId as string,
        'reports',
        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to view PRs for this user.',
        });
      }
    }

    const unitSystem = parseUnitSystem(req.query.unitSystem);
    if (!unitSystem) {
      return res.status(400).json({ error: INVALID_UNIT_SYSTEM_ERROR });
    }
    const prMatrix = await exerciseStatsService.getPersonalRecordMatrix(
      targetUserId,
      unitSystem
    );
    res.status(200).json(prMatrix);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /exercise-stats/matched-courses:
 *   get:
 *     summary: Get grouped matched courses and repeated loop activities
 *     tags: [Exercise Stats]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *         description: Target user; defaults to the authenticated user. Requires reports permission for anyone else.
 *       - in: query
 *         name: unitSystem
 *         schema: { type: string, enum: [metric, imperial], default: metric }
 *         description: Controls distance and pace formatting in the response.
 *     responses:
 *       200:
 *         description: Repeated courses with their recent activities.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MatchedCoursesResponse'
 *       400:
 *         description: Target User ID is required, or unitSystem is not metric/imperial.
 *       403:
 *         description: Forbidden — no reports permission for the requested user.
 */
router.get('/matched-courses', authenticate, async (req, res, next) => {
  try {
    const targetUserId = (req.query.userId as string) || req.userId;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target User ID is required.' });
    }

    if (req.query.userId && req.query.userId !== req.userId) {
      const hasPermission = await canAccessUserData(
        req.query.userId as string,
        'reports',
        req.authenticatedUserId || req.userId
      );
      if (!hasPermission) {
        return res.status(403).json({
          error:
            'Forbidden: You do not have permission to view matched courses for this user.',
        });
      }
    }

    const unitSystem = parseUnitSystem(req.query.unitSystem);
    if (!unitSystem) {
      return res.status(400).json({ error: INVALID_UNIT_SYSTEM_ERROR });
    }
    const matchedCourses = await exerciseStatsService.getMatchedCourses(
      targetUserId,
      unitSystem
    );
    res.status(200).json(matchedCourses);
  } catch (error) {
    next(error);
  }
});

export default router;
