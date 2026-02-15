// SparkyFitnessServer/routes/hevyRoutes.js

const express = require("express");
const router = express.Router();
const hevyService = require("../integrations/hevy/hevyService");
const { log } = require("../config/logging");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/integrations/hevy/sync:
 *   post:
 *     summary: Manually trigger a Hevy data sync
 *     tags: [External Integrations]
 */
router.post("/sync", authMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const createdByUserId = req.userId; // Currently same as userId
    const { providerId } = req.body;
    const { fullSync } = req.query;
    const result = await hevyService.syncHevyData(
      userId,
      createdByUserId,
      fullSync === "true",
      providerId,
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
 * /api/integrations/hevy/status:
 *   get:
 *     summary: Get Hevy connection status
 *     tags: [External Integrations]
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
