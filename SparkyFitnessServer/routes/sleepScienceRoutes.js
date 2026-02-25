const express = require('express');
const router = express.Router();
const sleepScienceService = require('../services/sleepScienceService');
const { log } = require('../config/logging');
const { authenticate } = require('../middleware/authMiddleware');
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');

/**
 * @swagger
 * tags:
 *   name: SleepScience
 *   description: Sleep science endpoints (MCTQ, sleep debt, energy curve, chronotype)
 */

/**
 * @swagger
 * /sleep-science/sleep-debt:
 *   get:
 *     summary: Get current sleep debt with 14-day breakdown
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: Optional user ID for family access
 *     responses:
 *       200:
 *         description: Sleep debt data
 */
router.get(
  '/sleep-debt',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const data = await sleepScienceService.calculateSleepDebt(targetUserId);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error calculating sleep debt:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/calculate-baseline:
 *   post:
 *     summary: Calculate and persist MCTQ baseline sleep need
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               windowDays:
 *                 type: number
 *                 default: 90
 *     responses:
 *       200:
 *         description: MCTQ calculation result
 */
router.post(
  '/calculate-baseline',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const windowDays = req.body.windowDays || 90;
      const result = await sleepScienceService.calculateBaseline(userId, windowDays);
      res.status(200).json(result);
    } catch (error) {
      log('error', 'Error calculating baseline:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/mctq-stats:
 *   get:
 *     summary: Get MCTQ statistics and calculation history
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MCTQ stats
 */
router.get(
  '/mctq-stats',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const data = await sleepScienceService.getMCTQStats(targetUserId);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error getting MCTQ stats:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/daily-need:
 *   get:
 *     summary: Get dynamic daily sleep need (WHOOP-style decomposition)
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Target date (defaults to today)
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daily sleep need breakdown
 */
router.get(
  '/daily-need',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const date =
        req.query.date || new Date().toISOString().slice(0, 10);
      const data = await sleepScienceService.getDailyNeed(targetUserId, date);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error getting daily need:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/energy-curve:
 *   get:
 *     summary: Get 24-hour energy curve (Two-Process Model)
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 96-point energy curve with zones
 */
router.get(
  '/energy-curve',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const data = await sleepScienceService.getEnergyCurve(targetUserId);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error generating energy curve:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/chronotype:
 *   get:
 *     summary: Get chronotype analysis
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chronotype classification and circadian markers
 */
router.get(
  '/chronotype',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const data = await sleepScienceService.getChronotype(targetUserId);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error getting chronotype:', error);
      next(error);
    }
  }
);

/**
 * @swagger
 * /sleep-science/data-sufficiency:
 *   get:
 *     summary: Check if enough sleep data exists for MCTQ calculation
 *     tags: [SleepScience]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Data sufficiency assessment
 */
router.get(
  '/data-sufficiency',
  authenticate,
  checkPermissionMiddleware('reports'),
  async (req, res, next) => {
    try {
      const targetUserId = (req.query.targetUserId && req.query.targetUserId !== 'undefined') ? req.query.targetUserId : req.userId;
      const data = await sleepScienceService.checkDataSufficiency(targetUserId);
      res.status(200).json(data);
    } catch (error) {
      log('error', 'Error checking data sufficiency:', error);
      next(error);
    }
  }
);

module.exports = router;
