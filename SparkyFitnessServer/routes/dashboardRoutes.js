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
 *     tags: [Dashboard]
 *     description: Returns daily energy goal stats. Can be authenticated via Browser Session or API Key (x-api-key).
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to fetch stats for (YYYY-MM-DD). Defaults to today in user's timezone.
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully.
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
