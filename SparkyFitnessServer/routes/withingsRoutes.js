// SparkyFitnessServer/routes/withingsRoutes.js

const express = require('express');
const router = express.Router();
const withingsService = require('../integrations/withings/withingsService');
const { log } = require('../config/logging');
const authMiddleware = require('../middleware/authMiddleware'); // Import the entire module

// Route to initiate Withings OAuth flow
router.get('/authorize', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId; // Assuming user ID is available from authentication
        const baseUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
        const redirectUri = `${baseUrl}/withings/callback`;
        const authorizationUrl = await withingsService.getAuthorizationUrl(userId, redirectUri);
        res.json({ authUrl: authorizationUrl });
    } catch (error) {
        log('error', `Error initiating Withings authorization: ${error.message}`);
        res.status(500).json({ message: 'Error initiating Withings authorization', error: error.message });
    }
});

// Route to handle Withings OAuth callback
router.post('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.body;

        if (error) {
            log('error', `Withings OAuth callback error: ${error}`);
            return res.status(400).json({ message: 'Withings OAuth error', error });
        }

        if (!code) {
            return res.status(400).json({ message: 'Authorization code not received.' });
        }

        // In a real application, 'state' should be validated against a stored value
        // associated with the user who initiated the authorization flow.
        // For now, we'll just log it.
        log('info', `Withings OAuth callback received. State: ${state}`);

        // Assuming we can derive userId from the state or a session,
        // for this example, we'll need to pass a placeholder or retrieve it differently.
        // In a production app, 'state' would typically contain a user identifier or a session ID.
        // For simplicity, let's assume a fixed user ID for now, or pass it through state.
        // For a proper implementation, the state parameter should be a JWT or encrypted object
        // containing the userId, which can be decrypted/verified here.
        const userId = state; // The userId was passed in the state parameter

        const tokenExchangeResult = await withingsService.exchangeCodeForTokens(userId, code, `${process.env.SPARKY_FITNESS_FRONTEND_URL}/withings/callback`, state);

        if (tokenExchangeResult.success) {
            res.status(200).json({ message: 'Withings account linked successfully.' });
        } else {
            res.status(500).json({ message: 'Failed to connect Withings account.' });
        }
    } catch (error) {
        log('error', `Error handling Withings OAuth callback: ${error.message}`);
        res.status(500).json({ message: 'Error handling Withings OAuth callback', error: error.message });
    }
});

// Route to manually trigger a data sync
router.post('/sync', authMiddleware.authenticate, async (req, res) => {
    log('info', 'Received request to /withings/sync');
    try {
        const userId = req.userId;
        const today = new Date();
        const endDateForYMD = new Date(today);
        endDateForYMD.setDate(today.getDate() + 1); // Set to tomorrow to ensure all of today's data is captured

        const startDateForYMD = new Date(today);
        startDateForYMD.setDate(today.getDate() - 7); // 7 days ago

        const startDateYMD = startDateForYMD.toISOString().split('T')[0];
        const endDateYMD = endDateForYMD.toISOString().split('T')[0]; // Tomorrow's date

        const startDateUnix = Math.floor(startDateForYMD.getTime() / 1000);
        const endDateUnix = Math.floor(today.getTime() / 1000); // End Unix timestamp at current time today

        log('info', `Starting Withings data sync for user ${userId} from ${startDateForYMD.toISOString()} to ${today.toISOString()}. Fetching workouts from ${startDateYMD} to ${endDateYMD}`);

        // We can run these in parallel to speed up the process
        await Promise.all([
            withingsService.fetchAndProcessMeasuresData(userId, userId, startDateUnix, endDateUnix),
            withingsService.fetchAndProcessHeartData(userId, userId, startDateUnix, endDateUnix),
            withingsService.fetchAndProcessSleepData(userId, userId, startDateUnix, endDateUnix),
            withingsService.fetchAndProcessWorkoutsData(userId, userId, startDateYMD, endDateYMD) // Add this line
        ]);

        log('info', `Withings data sync completed for user ${userId}`);
        res.status(200).json({ message: 'Withings data sync completed successfully.' });
    } catch (error) {
        log('error', `Error initiating manual Withings sync: ${error.message}`);
        res.status(500).json({ message: 'Error initiating manual Withings sync', error: error.message });
    }
});

// Route to disconnect a Withings account
router.post('/disconnect', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        await withingsService.disconnectWithings(userId);
        res.status(200).json({ message: 'Withings account disconnected successfully.' });
    } catch (error) {
        log('error', `Error disconnecting Withings account: ${error.message}`);
        res.status(500).json({ message: 'Error disconnecting Withings account', error: error.message });
    }
});

// Route to get Withings connection status and last sync time
router.get('/status', authMiddleware.authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const status = await withingsService.getStatus(userId);
        res.status(200).json(status);
    } catch (error) {
        log('error', `Error getting Withings status: ${error.message}`);
        res.status(500).json({ message: 'Error getting Withings status', error: error.message });
    }
});

module.exports = router;