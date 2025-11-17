const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const garminConnectService = require('../integrations/garminconnect/garminConnectService');
const externalProviderRepository = require('../models/externalProviderRepository');
const measurementService = require('../services/measurementService'); // Import measurementService
const garminMeasurementMapping = require('../integrations/garminconnect/garminMeasurementMapping'); // Import the mapping
const { log } = require('../config/logging');
const moment = require('moment'); // Import moment for date manipulation
const exerciseService = require('../services/exerciseService');
const activityDetailsRepository = require('../models/activityDetailsRepository');
const garminService = require('../services/garminService');

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
            const provider = await garminConnectService.handleGarminTokens(userId, result.tokens);
            res.status(200).json({ status: 'success', provider: provider });
        } else {
            res.status(200).json(result);
        }
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


// Endpoint to manually sync health and wellness data from Garmin
router.post('/sync/health_and_wellness', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { startDate, endDate, metricTypes } = req.body;
        log('debug', `[garminRoutes] Sync health_and_wellness received startDate: ${startDate}, endDate: ${endDate}`);

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required.' });
        }
        
        const healthWellnessData = await garminConnectService.syncGarminHealthAndWellness(userId, startDate, endDate, metricTypes);
        log('debug', `Raw healthWellnessData from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`, healthWellnessData);

        // Process the raw healthWellnessData using garminService
        // This will handle storing raw stress data and derived mood
        const processedGarminHealthData = await garminService.processGarminHealthAndWellnessData(userId, userId, healthWellnessData.data, startDate, endDate);

        // Existing processing for other metrics (if any)
        const processedHealthData = [];

        for (const metric in healthWellnessData.data) {
            // Skip stress as it's handled by processGarminHealthAndWellnessData
            if (metric === 'stress') continue;

            const dailyEntries = healthWellnessData.data[metric];
            if (Array.isArray(dailyEntries)) {
                for (const entry of dailyEntries) {
                    const calendarDateRaw = entry.date;
                    if (!calendarDateRaw) continue;

                    const calendarDate = moment(calendarDateRaw).format('YYYY-MM-DD');

                    for (const key in entry) {
                        if (key === 'date') continue;

                        let mapping = garminMeasurementMapping[key];
                        // If no mapping is found for the key, check if there's a mapping for the metric itself.
                        // This handles cases like 'blood_pressure' where the entry is just { date, value }.
                        if (!mapping && key === 'value') {
                            mapping = garminMeasurementMapping[metric];
                        }
                        if (mapping) {
                            const value = entry[key];
                            if (value === null || value === undefined) continue;

                            const type = mapping.targetType === 'check_in' ? mapping.field : mapping.name;
                            processedHealthData.push({
                                type: type,
                                value: value,
                                date: calendarDate,
                                source: 'garmin',
                                dataType: mapping.dataType,
                                measurementType: mapping.measurementType
                            });
                        }
                    }
                }
            }
        }

        log('debug', `Processed health data for measurementService:`, processedHealthData);

        let measurementServiceResult = {};
        if (processedHealthData.length > 0) {
            measurementServiceResult = await measurementService.processHealthData(processedHealthData, userId, userId);
        }

        let processedSleepData = {};
        if (healthWellnessData.data && healthWellnessData.data.sleep && healthWellnessData.data.sleep.length > 0) {
            processedSleepData = await garminService.processGarminSleepData(userId, userId, healthWellnessData.data.sleep, startDate, endDate);
        }

        res.status(200).json({
            message: 'Health and wellness sync completed.',
            garminRawData: healthWellnessData, // Keep raw data for debugging/reference
            processedGarminHealthData: processedGarminHealthData,
            processedMeasurements: measurementServiceResult,
            processedSleep: processedSleepData
        });
    } catch (error) {
        next(error);
    }
});

// Endpoint to manually sync activities and workouts data from Garmin
router.post('/sync/activities_and_workouts', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { startDate, endDate, activityType } = req.body;
        log('debug', `[garminRoutes] Sync activities_and_workouts received startDate: ${startDate}, endDate: ${endDate}`);

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required.' });
        }

        const rawData = await garminConnectService.fetchGarminActivitiesAndWorkouts(userId, startDate, endDate, activityType);
        log('debug', `Raw activities and workouts data from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`, rawData);

        const result = await garminService.processActivitiesAndWorkouts(userId, rawData, startDate, endDate);
        
        res.status(200).json(result);
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
        // log('debug', `Provider data from externalProviderRepository for user ${userId}:`, provider);

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
            await externalProviderRepository.deleteExternalDataProvider(provider.id, userId);
            res.status(200).json({ success: true, message: "Garmin Connect account unlinked successfully." });
        } else {
            res.status(400).json({ error: "Garmin Connect account not found for this user." });
        }
    } catch (error) {
        next(error);
    }
});

router.post('/sleep_data', authenticate, async (req, res, next) => {
    try {
        const userId = req.userId;
        const { sleepData, startDate, endDate } = req.body; // Expecting an array of sleep entries, startDate, and endDate

        if (!sleepData || !Array.isArray(sleepData)) {
            return res.status(400).json({ error: 'Invalid sleepData format. Expected an array.' });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required for sleep data sync.' });
        }

        const result = await garminService.processGarminSleepData(userId, userId, sleepData, startDate, endDate);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
