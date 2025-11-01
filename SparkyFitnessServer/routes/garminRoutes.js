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

        // Process the raw healthWellnessData using measurementService
        const processedHealthData = [];
        const checkInDataByDate = {}; // Use an object to group check-in data by date

        for (const metric in healthWellnessData.data) {
            const dailyEntries = healthWellnessData.data[metric];
            if (Array.isArray(dailyEntries)) {
                for (const entry of dailyEntries) {
                    const calendarDateRaw = entry.date;
                    if (!calendarDateRaw) continue; // Skip if no date is present

                    // Convert timestamp to YYYY-MM-DD format
                    const calendarDate = moment(calendarDateRaw).format('YYYY-MM-DD');

                    if (metric === 'body_composition') {
                        if (!checkInDataByDate[calendarDate]) {
                            checkInDataByDate[calendarDate] = {};
                        }
                        if (entry.weight !== undefined) checkInDataByDate[calendarDate].weight = entry.weight;
                        if (entry.body_fat_percentage !== undefined) checkInDataByDate[calendarDate].body_fat_percentage = entry.body_fat_percentage;
                        if (entry.body_water_percentage !== undefined) checkInDataByDate[calendarDate].body_water_percentage = entry.body_water_percentage;
                        if (entry.muscle_mass !== undefined) checkInDataByDate[calendarDate].muscle_mass_kg = entry.muscle_mass;
                    } else {
                        // Handle other metrics, including custom measurements
                        for (const key in entry) {
                            if (key !== 'date') {
                                const mapping = garminMeasurementMapping[key];
                                if (mapping) {
                                    const value = entry[key];
                                    if (mapping.targetType === 'check_in' && value !== undefined) {
                                        if (!checkInDataByDate[calendarDate]) {
                                            checkInDataByDate[calendarDate] = {};
                                        }
                                        checkInDataByDate[calendarDate][mapping.field] = value;
                                    } else if (mapping.targetType === 'custom' && value !== null && value !== undefined) {
                                        processedHealthData.push({
                                            type: mapping.name,
                                            value: value,
                                            date: calendarDate, // Use formatted date
                                            source: 'garmin',
                                            dataType: mapping.dataType,
                                            measurementType: mapping.measurementType
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        log('debug', `Processed health data for measurementService:`, processedHealthData);
        log('debug', `Processed check-in data for measurementService:`, checkInDataByDate);

        let measurementServiceResult = {};
        if (processedHealthData.length > 0) {
            measurementServiceResult = await measurementService.processHealthData(processedHealthData, userId, userId);
        }

        for (const date in checkInDataByDate) {
            if (Object.keys(checkInDataByDate[date]).length > 0) {
                await measurementService.upsertCheckInMeasurements(userId, userId, date, checkInDataByDate[date]);
            }
        }

        res.status(200).json({
            message: 'Health and wellness sync completed.',
            garminRawData: healthWellnessData, // Keep raw data for debugging/reference
            processedMeasurements: measurementServiceResult
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

module.exports = router;
