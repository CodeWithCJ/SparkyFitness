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

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required.' });
        }
        // metricTypes is optional, if not provided, the microservice should fetch all available

        const healthWellnessData = await garminConnectService.syncGarminHealthAndWellness(userId, startDate, endDate, metricTypes);
        log('debug', `Raw healthWellnessData from Garmin microservice for user ${userId} from ${startDate} to ${endDate}:`, healthWellnessData);

        const checkInMeasurementsByDate = {};
        const customMeasurements = [];

        // Access the nested 'data' object from the microservice response
        const garminData = healthWellnessData.data;

        for (const metricType in garminData) {
            const mapping = garminMeasurementMapping[metricType];
            if (!mapping) {
                log('warn', `No mapping found for Garmin metric type: ${metricType}`);
                continue;
            }

            const entries = garminData[metricType];
            if (!entries) { // If entries is null or undefined, skip
                continue;
            }

            const processEntry = (entry) => {
                // Special handling for Blood Pressure which has systolic and diastolic
                if (metricType === 'blood_pressure' && entry.systolic && entry.diastolic) {
                    const entryDate = moment(entry.date || startDate).format('YYYY-MM-DD');
                    customMeasurements.push({
                        type: 'Blood Pressure Systolic',
                        value: entry.systolic,
                        date: entryDate,
                        timestamp: moment(entry.date || startDate).toISOString(),
                        source: 'garmin'
                    });
                    customMeasurements.push({
                        type: 'Blood Pressure Diastolic',
                        value: entry.diastolic,
                        date: entryDate,
                        timestamp: moment(entry.date || startDate).toISOString(),
                        source: 'garmin'
                    });
                } else if (metricType === 'body_battery' && entry.chargeRemaining) {
                    const entryDate = moment(entry.date || startDate).format('YYYY-MM-DD');
                    customMeasurements.push({
                        type: 'Body Battery',
                        value: entry.chargeRemaining,
                        date: entryDate,
                        timestamp: moment(entry.date || startDate).toISOString(),
                        source: 'garmin'
                    });
                }
                else {
                    const entryDate = moment(entry.calendarDate || entry.date || entry.startTimeLocal || startDate).format('YYYY-MM-DD');
                    if (mapping.targetType === 'check_in') {
                        if (!checkInMeasurementsByDate[entryDate]) {
                            checkInMeasurementsByDate[entryDate] = {};
                        }
                        checkInMeasurementsByDate[entryDate][mapping.field] = entry.value || entry[mapping.field];
                    } else if (mapping.targetType === 'custom') {
                        customMeasurements.push({
                            type: mapping.name,
                            value: entry.value || entry[mapping.field],
                            date: entryDate,
                            timestamp: entry.timestamp || moment(entryDate).toISOString(),
                            source: 'garmin'
                        });
                    }
                }
            };

            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    processEntry(entry);
                }
            } else {
                // Handle cases where the data might be a single object (e.g., summary data)
                processEntry(entries);
            }
        }

        let processedCount = 0;
        let errorCount = 0;

        for (const date in checkInMeasurementsByDate) {
            try {
                await measurementService.upsertCheckInMeasurements(userId, userId, date, checkInMeasurementsByDate[date]);
                processedCount++;
            } catch (error) {
                log('error', `Failed to upsert check-in measurements for date ${date}:`, error);
                errorCount++;
            }
        }

        if (customMeasurements.length > 0) {
            try {
                const result = await measurementService.processHealthData(customMeasurements, userId, userId);
                processedCount += result.processed.length;
            } catch (error) {
                log('error', `Failed to process custom measurements:`, error);
                errorCount += customMeasurements.length;
            }
        }

        res.status(200).json({
            message: 'Health and wellness sync completed.',
            processedCount,
            errorCount
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

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required.' });
        }

        const result = await garminConnectService.syncGarminActivitiesAndWorkouts(userId, startDate, endDate, activityType);
        
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
