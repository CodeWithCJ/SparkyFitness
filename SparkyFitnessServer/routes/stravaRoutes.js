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
 * @swagger
 * /integrations/strava/authorize:
 *   get:
 *     summary: Get Strava OAuth authorization URL
 *     tags: [External Integrations]
 *     description: Returns the Strava OAuth URL to redirect the user to for authorization.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *         description: Custom redirect URI for the OAuth callback. Defaults to the configured frontend callback URL.
 *     responses:
 *       200:
 *         description: Authorization URL returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: The Strava OAuth authorization URL.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Server error.
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
 * @swagger
 * /integrations/strava/callback:
 *   post:
 *     summary: Exchange Strava authorization code for tokens
 *     tags: [External Integrations]
 *     description: Completes the OAuth flow by exchanging the authorization code for access and refresh tokens, then stores them for the user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: The OAuth authorization code from Strava.
 *               redirect_uri:
 *                 type: string
 *                 description: The redirect URI used during authorization. Must match the one used in the authorize step.
 *     responses:
 *       200:
 *         description: Tokens exchanged successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 externalUserId:
 *                   type: string
 *                   nullable: true
 *                   description: The Strava athlete ID.
 *       400:
 *         description: Authorization code is required.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Server error.
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
 * @swagger
 * /integrations/strava/sync:
 *   post:
 *     summary: Trigger a manual Strava data sync
 *     tags: [External Integrations]
 *     description: Fetches recent activities from Strava and syncs them as exercise entries.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date for the sync range (YYYY-MM-DD).
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date for the sync range (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Sync completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 source:
 *                   type: string
 *                   description: The data source used (e.g. "live_api").
 *                 activitiesProcessed:
 *                   type: integer
 *                   description: Number of activities synced.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Server error.
 */
router.post("/sync", async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.body;
    log(
      "info",
      `[stravaRoutes] Manual sync triggered for user ${userId}${startDate ? ` from ${startDate}` : ""}${endDate ? ` to ${endDate}` : ""}`,
    );
    const result = await stravaService.syncStravaData(
      userId,
      "manual",
      startDate,
      endDate,
    );
    res.json(result);
  } catch (error) {
    log("error", `[stravaRoutes] Error syncing data: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /integrations/strava/disconnect:
 *   post:
 *     summary: Disconnect Strava integration
 *     tags: [External Integrations]
 *     description: Removes the stored Strava tokens and disconnects the integration for the current user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Strava disconnected successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Server error.
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
 * @swagger
 * /integrations/strava/status:
 *   get:
 *     summary: Get Strava connection status
 *     tags: [External Integrations]
 *     description: Returns whether the user has an active Strava connection, along with sync and token metadata.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Strava connection status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                   description: Whether the user has a connected Strava account.
 *                 isActive:
 *                   type: boolean
 *                   description: Whether the integration is active.
 *                 lastSyncAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Timestamp of the last sync.
 *                 tokenExpiresAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: When the access token expires.
 *                 externalUserId:
 *                   type: string
 *                   nullable: true
 *                   description: The Strava athlete ID.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Server error.
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
