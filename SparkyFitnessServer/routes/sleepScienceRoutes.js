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
 *     description: Calculates the user's current sleep debt using a weighted 14-day rolling window. Returns the total debt, a categorized severity level, per-day breakdown with weighted deviations, a 7-day trend, and estimated payback time.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: Sleep debt data with 14-day breakdown and trend analysis.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentDebt:
 *                   type: number
 *                   description: Total accumulated sleep debt in hours.
 *                 debtCategory:
 *                   type: string
 *                   enum: [low, moderate, high, critical]
 *                   description: Categorized severity of the current sleep debt.
 *                 sleepNeed:
 *                   type: number
 *                   description: Baseline sleep need in hours (from MCTQ calculation).
 *                 last14Days:
 *                   type: array
 *                   description: Per-day breakdown of sleep debt over the last 14 days.
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         description: Date of the sleep entry (YYYY-MM-DD).
 *                       tst:
 *                         type: number
 *                         description: Total sleep time in hours.
 *                       deviation:
 *                         type: number
 *                         description: Deviation from sleep need in hours (negative means under-slept).
 *                       weight:
 *                         type: number
 *                         description: Recency weight applied to this day's deviation.
 *                       weightedDebt:
 *                         type: number
 *                         description: Weight-adjusted debt contribution for this day.
 *                 trend:
 *                   type: object
 *                   description: 7-day trend analysis of sleep debt.
 *                   properties:
 *                     direction:
 *                       type: string
 *                       enum: [improving, stable, worsening]
 *                       description: Direction of the sleep debt trend.
 *                     change7d:
 *                       type: number
 *                       description: Change in sleep debt over the last 7 days (negative means improving).
 *                 paybackTime:
 *                   type: number
 *                   description: Estimated number of days to pay back the current sleep debt.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     description: Runs the Munich Chronotype Questionnaire (MCTQ) algorithm to calculate the user's baseline sleep need. Uses workday/freeday sleep duration classification to determine corrected sleep need, social jetlag, and confidence level. Persists the result for use by other sleep science endpoints. Returns an error response if insufficient data is available.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               windowDays:
 *                 type: number
 *                 default: 90
 *                 description: Number of days of historical sleep data to analyze.
 *     responses:
 *       200:
 *         description: MCTQ calculation result. On success, returns baseline sleep metrics. On insufficient data, returns an error response.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Successful baseline calculation.
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     sleepNeedIdeal:
 *                       type: number
 *                       description: Corrected ideal sleep need in hours.
 *                     sdWorkday:
 *                       type: number
 *                       description: Average sleep duration on workdays in hours.
 *                     sdFreeday:
 *                       type: number
 *                       description: Average sleep duration on free days in hours.
 *                     sdWeek:
 *                       type: number
 *                       description: Weighted weekly average sleep duration in hours.
 *                     socialJetlag:
 *                       type: number
 *                       description: Social jetlag in hours (difference between workday and freeday midpoints).
 *                     confidence:
 *                       type: string
 *                       enum: [low, medium, high]
 *                       description: Confidence level of the calculation based on data quality and quantity.
 *                     basedOnDays:
 *                       type: integer
 *                       description: Total number of sleep days used in the calculation.
 *                     workdaysCount:
 *                       type: integer
 *                       description: Number of workdays included.
 *                     freedaysCount:
 *                       type: integer
 *                       description: Number of free days included.
 *                     method:
 *                       type: string
 *                       enum: [mctq_corrected, median_fallback]
 *                       description: Calculation method used.
 *                     dataStartDate:
 *                       type: string
 *                       format: date
 *                       description: Start date of the data window used.
 *                     dataEndDate:
 *                       type: string
 *                       format: date
 *                       description: End date of the data window used.
 *                 - type: object
 *                   description: Insufficient data to perform calculation.
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       description: Error type identifier.
 *                     message:
 *                       type: string
 *                       description: Human-readable explanation of why the calculation could not be performed.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     description: Retrieves the user's MCTQ profile including baseline sleep need, the latest calculation details, and day-of-week classifications showing workday vs. freeday patterns with wake time statistics.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: MCTQ statistics including profile, latest calculation, and day classifications.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   type: object
 *                   description: The user's MCTQ sleep profile.
 *                   properties:
 *                     baselineSleepNeed:
 *                       type: number
 *                       description: Baseline sleep need in hours.
 *                     method:
 *                       type: string
 *                       enum: [mctq_corrected, median_fallback]
 *                       description: Calculation method used for the baseline.
 *                     confidence:
 *                       type: string
 *                       enum: [low, medium, high]
 *                       description: Confidence level of the baseline calculation.
 *                     basedOnDays:
 *                       type: integer
 *                       description: Number of days the baseline was calculated from.
 *                     lastCalculated:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of the last baseline calculation.
 *                     sdWorkday:
 *                       type: number
 *                       description: Average sleep duration on workdays in hours.
 *                     sdFreeday:
 *                       type: number
 *                       description: Average sleep duration on free days in hours.
 *                     socialJetlag:
 *                       type: number
 *                       description: Social jetlag in hours.
 *                 latestCalculation:
 *                   type: object
 *                   description: Full details of the most recent MCTQ calculation.
 *                 dayClassifications:
 *                   type: array
 *                   description: Per-day-of-week classification and wake time statistics.
 *                   items:
 *                     type: object
 *                     properties:
 *                       dayOfWeek:
 *                         type: integer
 *                         minimum: 0
 *                         maximum: 6
 *                         description: Day of the week (0 = Sunday, 6 = Saturday).
 *                       classifiedAs:
 *                         type: string
 *                         enum: [freeday, workday]
 *                         description: Whether this day is classified as a freeday or workday.
 *                       meanWakeHour:
 *                         type: number
 *                         description: Mean wake time as fractional hours (e.g. 8.5 = 8:30 AM).
 *                       varianceMinutes:
 *                         type: number
 *                         description: Variance of wake time in minutes.
 *                       sampleCount:
 *                         type: integer
 *                         description: Number of data points for this day of the week.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     summary: Get dynamic daily sleep need
 *     tags: [SleepScience]
 *     description: Calculates the dynamic daily sleep need for a given date using a WHOOP-style decomposition. Combines the MCTQ baseline with additive factors for training strain, accumulated sleep debt, and subtractive factors for naps to produce a total sleep need recommendation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Target date (YYYY-MM-DD). Defaults to today.
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: Daily sleep need breakdown with contributing factors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date:
 *                   type: string
 *                   format: date
 *                   description: The target date for this calculation (YYYY-MM-DD).
 *                 baseline:
 *                   type: number
 *                   description: MCTQ baseline sleep need in hours.
 *                 strainAddition:
 *                   type: number
 *                   description: Additional sleep hours needed due to training strain.
 *                 debtAddition:
 *                   type: number
 *                   description: Additional sleep hours needed to pay down accumulated sleep debt.
 *                 napSubtraction:
 *                   type: number
 *                   description: Sleep hours subtracted due to naps taken during the day.
 *                 totalNeed:
 *                   type: number
 *                   description: Total recommended sleep need in hours (baseline + strain + debt - naps).
 *                 method:
 *                   type: string
 *                   enum: [mctq_corrected, median_fallback]
 *                   description: MCTQ calculation method used for the baseline.
 *                 confidence:
 *                   type: string
 *                   enum: [low, medium, high]
 *                   description: Confidence level of the baseline calculation.
 *                 trainingLoadScore:
 *                   type: number
 *                   nullable: true
 *                   description: Training load score used for strain calculation, or null if unavailable.
 *                 currentDebtHours:
 *                   type: number
 *                   description: Current accumulated sleep debt in hours.
 *                 napMinutes:
 *                   type: number
 *                   description: Total nap time for the day in minutes.
 *                 recoveryScoreYesterday:
 *                   type: number
 *                   nullable: true
 *                   description: Previous day's recovery score, or null if unavailable.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     summary: Get 24-hour energy curve
 *     tags: [SleepScience]
 *     description: Generates a 24-hour energy prediction curve using the Two-Process Model of sleep regulation (Process S - homeostatic sleep pressure, Process C - circadian rhythm). Returns energy levels at each hour with zone classifications, the current energy state, upcoming peaks and dips, and the optimal melatonin window. Returns an error response if insufficient data is available.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: Energy curve data with zone classifications and circadian markers. Returns an error object if insufficient data is available.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Successful energy curve calculation.
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     points:
 *                       type: array
 *                       description: Hourly energy data points for the 24-hour period.
 *                       items:
 *                         type: object
 *                         properties:
 *                           hour:
 *                             type: number
 *                             description: Hour of the day (0-23).
 *                           time:
 *                             type: string
 *                             format: date-time
 *                             description: ISO 8601 timestamp for this data point.
 *                           energy:
 *                             type: number
 *                             description: Predicted energy level (0-100).
 *                           zone:
 *                             type: string
 *                             enum: [sleep, wind-down, peak, dip, rising]
 *                             description: Energy zone classification for this hour.
 *                           processS:
 *                             type: number
 *                             description: Homeostatic sleep pressure value (Process S).
 *                           processC:
 *                             type: number
 *                             description: Circadian rhythm value (Process C).
 *                     currentEnergy:
 *                       type: number
 *                       description: Current energy level (0-100).
 *                     currentZone:
 *                       type: string
 *                       enum: [sleep, wind-down, peak, dip, rising]
 *                       description: Current energy zone classification.
 *                     nextPeak:
 *                       type: object
 *                       description: The next upcoming energy peak.
 *                       properties:
 *                         hour:
 *                           type: number
 *                           description: Hour of the next peak as fractional hours.
 *                         energy:
 *                           type: number
 *                           description: Predicted energy level at the next peak.
 *                     nextDip:
 *                       type: object
 *                       description: The next upcoming energy dip.
 *                       properties:
 *                         hour:
 *                           type: number
 *                           description: Hour of the next dip as fractional hours.
 *                         energy:
 *                           type: number
 *                           description: Predicted energy level at the next dip.
 *                     melatoninWindow:
 *                       type: object
 *                       description: Optimal melatonin onset window for sleep preparation.
 *                       properties:
 *                         start:
 *                           type: number
 *                           description: Start of the melatonin window as fractional hours.
 *                         end:
 *                           type: number
 *                           description: End of the melatonin window as fractional hours.
 *                     wakeTime:
 *                       type: number
 *                       description: Wake time as fractional hours (e.g. 7.0 = 7:00 AM).
 *                     sleepDebtPenalty:
 *                       type: number
 *                       description: Energy penalty applied due to accumulated sleep debt.
 *                 - type: object
 *                   description: Insufficient data to generate energy curve.
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       description: Error type identifier.
 *                     message:
 *                       type: string
 *                       description: Human-readable explanation of why the energy curve could not be generated.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     description: Analyzes the user's sleep timing patterns to determine their chronotype classification (early, intermediate, or late). Derives circadian markers including the circadian nadir, acrophase, and optimal melatonin window from average sleep and wake times.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: Chronotype classification and circadian markers.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 chronotype:
 *                   type: string
 *                   enum: [early, intermediate, late]
 *                   description: Chronotype classification based on sleep timing patterns.
 *                 averageWakeTime:
 *                   type: string
 *                   description: Average wake time in HH:MM format.
 *                   example: "07:15"
 *                 averageSleepTime:
 *                   type: string
 *                   description: Average sleep onset time in HH:MM format.
 *                   example: "23:00"
 *                 circadianNadir:
 *                   type: string
 *                   description: Estimated circadian nadir (lowest energy point) in HH:MM format.
 *                   example: "05:15"
 *                 circadianAcrophase:
 *                   type: string
 *                   description: Estimated circadian acrophase (peak alertness point) in HH:MM format.
 *                   example: "17:15"
 *                 melatoninWindowStart:
 *                   type: string
 *                   description: Start of the optimal melatonin onset window in HH:MM format.
 *                   example: "21:00"
 *                 melatoninWindowEnd:
 *                   type: string
 *                   description: End of the optimal melatonin onset window in HH:MM format.
 *                   example: "23:00"
 *                 basedOnDays:
 *                   type: integer
 *                   description: Number of days of sleep data used for the analysis.
 *                 confidence:
 *                   type: string
 *                   enum: [low, medium, high]
 *                   description: Confidence level of the chronotype classification.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
 *     description: Evaluates whether the user has sufficient sleep data to run an MCTQ baseline calculation. Reports counts for total days, timestamped days, workdays, and free days against the minimum thresholds, along with a projected confidence level and a human-readable recommendation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: targetUserId
 *         schema:
 *           type: string
 *         description: User ID to retrieve data for. Used for family access when viewing another user's data. Defaults to the authenticated user.
 *     responses:
 *       200:
 *         description: Data sufficiency assessment for MCTQ calculation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sufficient:
 *                   type: boolean
 *                   description: Whether there is enough data to perform an MCTQ calculation.
 *                 totalDays:
 *                   type: integer
 *                   description: Total number of days with sleep data.
 *                 daysWithTimestamps:
 *                   type: integer
 *                   description: Number of days that have precise bedtime/wake time timestamps.
 *                 workdaysAvailable:
 *                   type: integer
 *                   description: Number of workdays with sleep data available.
 *                 freedaysAvailable:
 *                   type: integer
 *                   description: Number of free days with sleep data available.
 *                 workdaysNeeded:
 *                   type: integer
 *                   description: Minimum number of workdays required for MCTQ calculation.
 *                 freedaysNeeded:
 *                   type: integer
 *                   description: Minimum number of free days required for MCTQ calculation.
 *                 projectedConfidence:
 *                   type: string
 *                   enum: [low, medium, high]
 *                   description: Projected confidence level if the calculation were run with current data.
 *                 recommendation:
 *                   type: string
 *                   description: Human-readable recommendation about data sufficiency.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
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
