const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const garminConnectService = require('../integrations/garminconnect/garminConnectService');
const externalProviderRepository = require('../models/externalProviderRepository');
const measurementService = require('../services/measurementService'); // Import measurementService
const { log } = require('../config/logging');
const moment = require('moment'); // Import moment for date manipulation

router.use(express.json());

// Endpoint for Garmin direct login
router.post('/login', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const result = await garminConnectService.garminLogin(userId, email, password);
        log('info', `Garmin login microservice response for user ${userId}:`, result);
        if (result.status === 'success' && result.tokens) {
            log('info', `Garmin login successful for user ${userId}. Handling tokens...`);
            await garminConnectService.handleGarminTokens(userId, result.tokens);
        }
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

// Endpoint to resume Garmin login (e.g., after MFA)
router.post('/resume_login', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { client_state, mfa_code } = req.body;
        if (!client_state || !mfa_code) {
            return res.status(400).json({ error: 'Client state and MFA code are required.' });
        }
        const result = await garminConnectService.garminResumeLogin(userId, client_state, mfa_code);
        log('info', `Garmin resume login microservice response for user ${userId}:`, result);
        if (result.status === 'success' && result.tokens) {
            log('info', `Garmin resume login successful for user ${userId}. Handling tokens...`);
            await garminConnectService.handleGarminTokens(userId, result.tokens);
        }
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

// Endpoint to manually sync daily summary data from Garmin for the last 3 days
router.post('/sync/daily_summary', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const syncedDates = [];
        const errors = [];

        // Sync for the last 3 days (today, yesterday, day before yesterday)
        for (let i = 0; i < 3; i++) {
            const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
            log('info', `Attempting to sync daily summary for user ${userId} on ${date}`);

            try {
                // Retrieve Garmin tokens for the user from the database
                const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');
                if (!provider || !provider.garth_dump) {
                    throw new Error('Garmin Connect not linked for this user or tokens missing.');
                }

                const summaryData = await garminConnectService.getGarminDailySummary(userId, date);
                log('debug', `Raw summaryData from Garmin microservice for user ${userId} on ${date}:`, summaryData);

                if (summaryData && summaryData.data) {
                    const healthDataArray = [
                        { type: 'step', value: summaryData.data.totalSteps, date: date, timestamp: new Date(date).toISOString(), source: 'garmin' },
                        { type: 'Active Calories', value: summaryData.data.activeKilocalories, date: date, timestamp: new Date(date).toISOString(), source: 'garmin' },
                        { type: 'Floors Climbed', value: summaryData.data.floorsClimbed, date: date, timestamp: new Date(date).toISOString(), source: 'garmin' },
                        { type: 'Distance (km)', value: summaryData.data.totalDistanceMeters ? (summaryData.data.totalDistanceMeters / 1000) : null, date: date, timestamp: new Date(date).toISOString(), source: 'garmin' }
                    ].filter(entry => entry.value !== null && entry.value !== undefined);

                    log('debug', `HealthDataArray for daily summary for user ${userId} on ${date}:`, healthDataArray);
                    const processedResults = await measurementService.processHealthData(healthDataArray, userId, userId);
                    log('info', `Daily summary data processed for user ${userId} on ${date}. Results:`, processedResults);
                    syncedDates.push(date);
                } else {
                    log('warn', `No summary data received for user ${userId} on ${date}.`);
                    errors.push(`No summary data for ${date}.`);
                }
            } catch (innerError) {
                log('error', `Error syncing daily summary for user ${userId} on ${date}:`, innerError.message);
                errors.push(`Failed to sync ${date}: ${innerError.message}`);
            }
        }

        if (errors.length > 0) {
            return res.status(500).json({
                message: `Daily summary sync completed with errors for some days. Synced: ${syncedDates.join(', ')}. Errors: ${errors.join('; ')}`,
                syncedDates: syncedDates,
                errors: errors
            });
        }

        res.status(200).json({ message: `Daily summary synced successfully for the last ${syncedDates.length} days.`, syncedDates: syncedDates });
    } catch (error) {
        next(error);
    }
});

// Endpoint to manually sync body composition data from Garmin
router.post('/sync/body_composition', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { startDate, endDate } = req.body; // Dates in YYYY-MM-DD format
        
        // Retrieve Garmin tokens for the user from the database
        const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');
        if (!provider || !provider.garth_dump) {
            return res.status(400).json({ error: 'Garmin Connect not linked for this user or tokens missing.' });
        }
 
        const tokensB64 = provider.garth_dump; // This is already decrypted by the repository

        const bodyCompData = await garminConnectService.getGarminBodyComposition(userId, startDate, endDate);
        log('debug', `Raw bodyCompData from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`, bodyCompData);

        if (bodyCompData && bodyCompData.data && bodyCompData.data.length > 0) {
            const healthDataArray = bodyCompData.data.map(entry => {
                const entryDate = entry.calendarDate; // Assuming calendarDate is available in bodyCompData entries
                const entryTimestamp = new Date(entryDate).toISOString(); // Use entryDate for timestamp at midnight
                return [
                    { type: 'weight', value: entry.weight, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Body Fat (%)', value: entry.percentFat, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Hydration (%)', value: entry.percentHydration, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Visceral Fat Mass', value: entry.visceralFatMass, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Bone Mass', value: entry.boneMass, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Muscle Mass', value: entry.muscleMass, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Basal Metabolic Rate', value: entry.basalMet, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Active Metabolic Rate', value: entry.activeMet, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Physique Rating', value: entry.physiqueRating, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Metabolic Age', value: entry.metabolicAge, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'Visceral Fat Rating', value: entry.visceralFatRating, date: entryDate, timestamp: entryTimestamp, source: 'garmin' },
                    { type: 'BMI', value: entry.bmi, date: entryDate, timestamp: entryTimestamp, source: 'garmin' }
                ].filter(item => item.value !== null && item.value !== undefined);
            }).flat(); // Flatten the array of arrays

            log('debug', `HealthDataArray for body composition for user ${userId} from ${startDate} to ${endDate}:`, healthDataArray);
            const processedResults = await measurementService.processHealthData(healthDataArray, userId, userId);
            log('info', `Body composition data processed for user ${userId} from ${startDate} to ${endDate}. Results:`, processedResults);
        } else {
            log('warn', `No body composition data received for user ${userId} from ${startDate} to ${endDate}.`);
        }
        res.status(200).json({ message: 'Body composition synced successfully.', data: bodyCompData });
    } catch (error) {
        next(error);
    }
});

// Endpoint to get Garmin connection status and token info
router.get('/status', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        log('debug', `Garmin /status endpoint called for user: ${userId}`);
        const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');
        log('debug', `Provider data from externalProviderRepository for user ${userId}:`, provider);

        if (provider) {
            // For security, do not send raw tokens to the frontend.
            // Instead, send status, last updated, and token expiry.
            // You might also send a masked external_user_id if available and useful for display.
            res.status(200).json({
                isLinked: true,
                lastUpdated: provider.updated_at,
                tokenExpiresAt: provider.token_expires_at,
                // externalUserId: provider.external_user_id ? `${provider.external_user_id.substring(0, 4)}...` : null, // Example masking
                message: "Garmin Connect is linked."
            });
        } else {
            res.status(200).json({
                isLinked: false,
                message: "Garmin Connect is not linked."
            });
        }
    } catch (error) {
        next(error);
    }
});

// Endpoint to unlink Garmin account
router.post('/unlink', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const provider = await externalProviderRepository.getExternalDataProviderByUserIdAndProviderName(userId, 'garmin');

        if (provider) {
            await externalProviderRepository.deleteExternalDataProvider(provider.id);
            res.status(200).json({ success: true, message: "Garmin Connect account unlinked successfully." });
        } else {
            res.status(400).json({ error: "Garmin Connect account not found for this user." });
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;
