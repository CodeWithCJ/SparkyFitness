// SparkyFitnessServer/routes/hevyRoutes.js

const express = require("express");
const router = express.Router();
const hevyService = require("../integrations/hevy/hevyService");
const { log } = require("../config/logging");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /integrations/hevy/sync:
 *   post:
 *     summary: Manually trigger a Hevy data sync
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: fullSync
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         required: false
 *         description: Whether to perform a full sync of all Hevy data.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               providerId:
 *                 type: string
 *                 description: The unique identifier of the Hevy provider to sync.
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for the sync range (YYYY-MM-DD).
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date for the sync range (YYYY-MM-DD).
 *               fullSync:
 *                 type: boolean
 *                 description: Whether to perform a full sync of all Hevy data.
 *     responses:
 *       200:
 *         description: Hevy data sync completed successfully.
 *       401:
 *         description: Invalid Hevy API Key.
 *       500:
 *         description: Error initiating manual Hevy sync.
 */
router.post("/sync", authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const createdByUserId = req.userId;
    const { providerId, startDate, endDate } = req.body;
    const fullSync = req.query.fullSync === "true" || req.body.fullSync === true;
    
    log(
      "info",
      `[hevyRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ""}${endDate ? ` to ${endDate}` : ""}`,
    );

    const result = await hevyService.syncHevyData(
      userId,
      createdByUserId,
      fullSync,
      providerId,
      startDate,
      endDate,
    );
    res.status(200).json(result);
  } catch (error) {
    log("error", `Error initiating manual Hevy sync: ${error.message}`);

    // Check for 401 Unauthorized from Hevy API
    if (error.message.includes("401")) {
      return res.status(401).json({
        message: "Invalid Hevy API Key. Please check your key and try again.",
        error: error.message,
      });
    }

    res.status(500).json({
      message: "Error initiating manual Hevy sync",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /integrations/hevy/status:
 *   get:
 *     summary: Get Hevy connection status
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Hevy connection status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isConnected:
 *                   type: boolean
 *                   description: Whether the user has a connected Hevy account.
 *                 lastSyncAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: The date and time of the last successful data sync.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Error getting Hevy status.
 */
router.get("/status", authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const status = await hevyService.getStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    log("error", `Error getting Hevy status: ${error.message}`);
    res
      .status(500)
      .json({ message: "Error getting Hevy status", error: error.message });
  }
});

module.exports = router;
