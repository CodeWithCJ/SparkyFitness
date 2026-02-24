// SparkyFitnessServer/routes/stravaRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const stravaIntegrationService = require("../integrations/strava/stravaService");
const stravaService = require("../services/stravaService");
const { log } = require("../config/logging");

// All Strava routes require authentication
router.use(authMiddleware.authenticate);

/**
 * GET /authorize
 * Returns the Strava OAuth authorization URL
 */
router.get("/authorize", async (req, res) => {
  try {
    const userId = req.userId;
    const redirectUri =
      req.query.redirect_uri ||
      `${process.env.SPARKY_FITNESS_FRONTEND_URL}/strava/callback`;

    const authUrl = await stravaIntegrationService.getAuthorizationUrl(
      userId,
      redirectUri,
    );
    res.json({ url: authUrl });
  } catch (error) {
    log(
      "error",
      `[stravaRoutes] Error getting authorization URL: ${error.message}`,
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /callback
 * Exchange authorization code for tokens
 */
router.post("/callback", async (req, res) => {
  try {
    const userId = req.userId;
    const { code } = req.body;
    const redirectUri =
      req.body.redirect_uri ||
      `${process.env.SPARKY_FITNESS_FRONTEND_URL}/strava/callback`;

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required." });
    }

    const result = await stravaIntegrationService.exchangeCodeForTokens(
      userId,
      code,
      redirectUri,
    );
    res.json(result);
  } catch (error) {
    log("error", `[stravaRoutes] Error exchanging code: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /sync
 * Trigger a manual Strava data sync
 */
router.post("/sync", async (req, res) => {
  try {
    const userId = req.userId;
    log("info", `[stravaRoutes] Manual sync triggered for user ${userId}`);
    const result = await stravaService.syncStravaData(userId, "manual");
    res.json(result);
  } catch (error) {
    log("error", `[stravaRoutes] Error syncing data: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /disconnect
 * Disconnect Strava integration
 */
router.post("/disconnect", async (req, res) => {
  try {
    const userId = req.userId;
    const result = await stravaService.disconnectStrava(userId);
    res.json(result);
  } catch (error) {
    log("error", `[stravaRoutes] Error disconnecting: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /status
 * Get Strava connection status
 */
router.get("/status", async (req, res) => {
  try {
    const userId = req.userId;
    const status = await stravaService.getStatus(userId);
    res.json(status);
  } catch (error) {
    log("error", `[stravaRoutes] Error getting status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
