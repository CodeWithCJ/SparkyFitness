const express = require("express");
const router = express.Router();
const dashboardService = require("../services/DashboardService");
const { authenticate } = require("../middleware/authMiddleware");
const { log } = require("../config/logging");

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics for external widgets
 *     tags: [Nutrition & Meals]
 *     description: Returns daily energy balance and activity stats. Can be authenticated via browser session or API key (x-api-key). Useful for external widgets and integrations.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to fetch stats for (YYYY-MM-DD). Defaults to today in user's timezone.
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eaten:
 *                   type: integer
 *                   description: Total calories consumed.
 *                 burned:
 *                   type: integer
 *                   description: Total calories burned (exercise + optionally BMR).
 *                 remaining:
 *                   type: integer
 *                   description: Calories remaining for the day.
 *                 goal:
 *                   type: integer
 *                   description: Daily calorie goal (adjusted by goal mode).
 *                 net:
 *                   type: integer
 *                   description: Net calories (eaten minus burned).
 *                 progress:
 *                   type: integer
 *                   description: Percentage of goal consumed (0-100).
 *                 steps:
 *                   type: integer
 *                   description: Step count for the day.
 *                 bmr:
 *                   type: integer
 *                   description: Basal metabolic rate.
 *                 unit:
 *                   type: string
 *                   example: kcal
 *                   description: Energy unit (always "kcal").
 *       401:
 *         description: Authentication required.
 */
router.get("/stats", authenticate, async (req, res, next) => {
  try {
    const userId = req.activeUserId || req.authenticatedUserId;
    const date = req.query.date || new Date().toISOString().split("T")[0];

    log("info", `Dashboard stats requested for user ${userId} on date ${date}`);

    const stats = await dashboardService.getDashboardStats(userId, date);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
