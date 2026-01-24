// SparkyFitnessServer/integrations/fitbit/fitbitDataProcessor.js

const measurementRepository = require('../../models/measurementRepository');
const exerciseEntryRepository = require('../../models/exerciseEntry');
const exerciseRepository = require('../../models/exercise');
const activityDetailsRepository = require('../../models/activityDetailsRepository');
const sleepRepository = require('../../models/sleepRepository');
const { log } = require('../../config/logging');

// Conversion factors for en-US to Metric
const LBS_TO_KG = 0.453592;
const IN_TO_CM = 2.54;
const MILES_TO_KM = 1.60934;
const FAHRENHEIT_TO_CELSIUS_OFFSET = 32;
const FAHRENHEIT_TO_CELSIUS_FACTOR = 5 / 9;

/**
 * Helper to parse Fitbit local time string with a provided offset
 * @param {string} localTimeStr - e.g. "2023-10-27T10:00:00.000"
 * @param {number} offsetMs - Offset from UTC in milliseconds
 * @returns {string} - ISO string in UTC
 */
function parseFitbitTime(localTimeStr, offsetMs = 0) {
    if (!localTimeStr) return null;
    // If it already has an offset or 'Z', return as is
    if (localTimeStr.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(localTimeStr)) {
        return new Date(localTimeStr).toISOString();
    }

    // Append the offset to the string if it's a simple ISO-like string.
    const sign = offsetMs >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMs);
    const hours = Math.floor(absOffset / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((absOffset % 3600000) / 60000).toString().padStart(2, '0');
    const offsetStr = `${sign}${hours}:${minutes}`;

    // Fitbit format is sometimes "2023-10-27 10:00:00" or "2023-10-27T10:00:00"
    const normalizedStr = localTimeStr.replace(' ', 'T');
    return new Date(`${normalizedStr}${offsetStr}`).toISOString();
}

/**
 * Process Fitbit profile data (for height)
 */
async function processFitbitProfile(userId, createdByUserId, data, date = null) {
    if (!data || !data.user) return;
    let height = data.user.height;
    const heightUnit = data.user.heightUnit;

    // Fitbit Profile API height is typically returned in Centimeters by default.
    // We will treat it as CM to avoid double-conversion issues.
    const syncDate = date || new Date().toISOString().split('T')[0];
    await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, syncDate, { height });
    log('info', `Upserted Fitbit height for user ${userId}: ${height} cm on ${syncDate}.`);
}

/**
 * Process Fitbit heart rate data
 */
async function processFitbitHeartRate(userId, createdByUserId, data) {
    if (!data || !data['activities-heart'] || data['activities-heart'].length === 0) {
        log('info', `No Fitbit heart rate data to process for user ${userId}.`);
        return;
    }

    for (const entry of data['activities-heart']) {
        const entryDate = entry.dateTime;
        const restingHeartRate = entry.value.restingHeartRate;

        if (restingHeartRate) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Resting Heart Rate',
                value: restingHeartRate,
                unit: 'bpm',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
            log('info', `Upserted Fitbit resting heart rate for user ${userId} on ${entryDate}.`);
        }
    }
}

/**
 * Process Fitbit steps data
 */
async function processFitbitSteps(userId, createdByUserId, data) {
    if (!data || !data['activities-steps'] || data['activities-steps'].length === 0) {
        log('info', `No Fitbit steps data to process for user ${userId}.`);
        return;
    }

    for (const entry of data['activities-steps']) {
        const entryDate = entry.dateTime;
        const steps = parseInt(entry.value, 10);

        if (!isNaN(steps)) {
            await measurementRepository.upsertStepData(userId, createdByUserId, steps, entryDate);
            log('info', `Upserted Fitbit steps for user ${userId} on ${entryDate}.`);
        }
    }
}

/**
 * Process Fitbit weight data
 */
async function processFitbitWeight(userId, createdByUserId, data, weightUnit = 'METRIC') {
    if (!data || !data.weight || data.weight.length === 0) {
        log('info', `No Fitbit weight data to process for user ${userId}.`);
        return;
    }

    for (const entry of data.weight) {
        const entryDate = entry.date;
        let weight = entry.weight;

        // weightUnit can be 'en_US' (pounds), 'METRIC' (kilograms), or 'UK' (stone).
        if (weightUnit === 'en_US') {
            weight = parseFloat((weight * LBS_TO_KG).toFixed(2));
        }

        await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, entryDate, { weight });
        log('info', `Upserted Fitbit weight for user ${userId} on ${entryDate}: ${weight} kg.`);
    }
}

/**
 * Process Fitbit body fat data
 */
async function processFitbitBodyFat(userId, createdByUserId, data) {
    if (!data || !data.fat || data.fat.length === 0) return;
    for (const entry of data.fat) {
        const entryDate = entry.date;
        const fat = entry.fat;
        if (fat) {
            await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, entryDate, { body_fat_percentage: fat });
            log('info', `Upserted Fitbit body fat for user ${userId} on ${entryDate}: ${fat}%.`);
        }
    }
}

/**
 * Process Fitbit SpO2 data
 */
async function processFitbitSpO2(userId, createdByUserId, data) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        log('info', `No Fitbit SpO2 data to process for user ${userId}.`);
        return;
    }

    const dataList = Array.isArray(data) ? data : [data];

    for (const entry of dataList) {
        if (!entry || !entry.value) continue;
        const entryDate = entry.dateTime;
        const spo2 = entry.value.avg;

        if (spo2) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'SpO2',
                value: spo2,
                unit: '%',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
            log('info', `Upserted Fitbit SpO2 for user ${userId} on ${entryDate}.`);
        }
    }
}

/**
 * Process Fitbit skin temperature data
 */
async function processFitbitTemperature(userId, createdByUserId, data, temperatureUnit = 'METRIC') {
    if (!data || !data.tempSkin || data.tempSkin.length === 0) {
        log('info', `No Fitbit temperature data to process for user ${userId}.`);
        return;
    }

    for (const entry of data.tempSkin) {
        const entryDate = entry.dateTime;
        let tempVariation = entry.value.nightlyRelative;

        if (tempVariation !== undefined) {
            // If unit is en_US, convert variation from Fahrenheit to Celsius scale.
            // Note: For relative temperature changes, we only multiply by 5/9, don't subtract 32!
            if (temperatureUnit === 'en_US') {
                tempVariation = parseFloat((tempVariation * FAHRENHEIT_TO_CELSIUS_FACTOR).toFixed(2));
            }
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Skin Temperature Variation',
                value: tempVariation,
                unit: 'C',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
            log('info', `Upserted Fitbit skin temperature variation for user ${userId} on ${entryDate}: ${tempVariation} C.`);
        }
    }
}

/**
 * Process Fitbit HRV data
 */
async function processFitbitHRV(userId, createdByUserId, data) {
    if (!data || !data.hrv || data.hrv.length === 0) return;
    for (const entry of data.hrv) {
        const entryDate = entry.dateTime;
        const dailyRmssd = entry.value.dailyRmssd;
        if (dailyRmssd) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'HRV (dailyRmssd)',
                value: dailyRmssd,
                unit: 'ms',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
        }
    }
}

/**
 * Process Fitbit Respiratory Rate data
 */
async function processFitbitRespiratoryRate(userId, createdByUserId, data) {
    if (!data || !data.br || data.br.length === 0) return;
    for (const entry of data.br) {
        const entryDate = entry.dateTime;
        const br = entry.value?.fullSleepSummary?.breathingRate;
        if (br) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Respiratory Rate',
                value: br,
                unit: 'brpm',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
        }
    }
}

/**
 * Process Fitbit Active Zone Minutes data
 */
async function processFitbitActiveZoneMinutes(userId, createdByUserId, data) {
    if (!data || !data['activities-active-zone-minutes'] || data['activities-active-zone-minutes'].length === 0) return;
    for (const entry of data['activities-active-zone-minutes']) {
        const entryDate = entry.dateTime;
        const azm = entry.value.activeZoneMinutes;
        if (azm) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Active Zone Minutes',
                value: azm,
                unit: 'minutes',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            });
        }
    }
}

/**
 * Process Fitbit Activity Minutes data
 */
async function processFitbitActivityMinutes(userId, createdByUserId, data) {
    if (!data) return;
    for (const metric in data) {
        const entries = data[metric];
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
            const entryDate = entry.dateTime;
            const value = parseInt(entry.value, 10);
            if (!isNaN(value)) {
                await upsertCustomMeasurementLogic(userId, createdByUserId, {
                    categoryName: metric.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                    value: value,
                    unit: 'minutes',
                    entryDate: entryDate,
                    entryHour: 0,
                    entryTimestamp: new Date(entryDate).toISOString(),
                    frequency: 'Daily'
                });
            }
        }
    }
}

/**
 * Process Fitbit Sleep data
 */
async function processFitbitSleep(userId, createdByUserId, data, timezoneOffset = 0) {
    if (!data || !data.sleep || data.sleep.length === 0) return;
    for (const entry of data.sleep) {
        const sleepEntryData = {
            entry_date: entry.dateOfSleep,
            bedtime: parseFitbitTime(entry.startTime, timezoneOffset),
            wake_time: parseFitbitTime(entry.endTime, timezoneOffset),
            duration_in_seconds: Math.round(entry.duration / 1000),
            time_asleep_in_seconds: entry.minutesAsleep * 60,
            sleep_score: entry.efficiency, // Fitbit's efficiency (0-100) as a proxy if score not found
            source: 'Fitbit',
            deep_sleep_seconds: entry.levels.summary?.deep?.minutes * 60 || 0,
            light_sleep_seconds: entry.levels.summary?.light?.minutes * 60 || 0,
            rem_sleep_seconds: entry.levels.summary?.rem?.minutes * 60 || 0,
            awake_sleep_seconds: entry.levels.summary?.wake?.minutes * 60 || 0
        };

        const result = await sleepRepository.upsertSleepEntry(userId, createdByUserId, sleepEntryData);
        if (result && result.id && entry.levels && entry.levels.data) {
            // First, delete existing sleep stages for this entry to prevent duplication
            // This aligns with how other providers (Apple/Android) handle sleep stage updates
            await sleepRepository.deleteSleepStageEventsByEntryId(userId, result.id);

            for (const stage of entry.levels.data) {
                const startIso = parseFitbitTime(stage.dateTime, timezoneOffset);
                const startTime = new Date(startIso);
                const endTime = new Date(startTime.getTime() + stage.seconds * 1000);
                await sleepRepository.upsertSleepStageEvent(userId, result.id, {
                    stage_type: stage.level,
                    start_time: startIso,
                    end_time: endTime.toISOString(),
                    duration_in_seconds: stage.seconds
                });
            }
        }
    }
}

/**
 * Process Fitbit Water data
 */
async function processFitbitWater(userId, createdByUserId, data, waterUnit = 'METRIC') {
    if (!data || !data.summary || data.summary.water === undefined) return;

    let water = data.summary.water;
    // waterUnit: 'en_US' (fluid ounces), 'METRIC' (milliliters)
    if (waterUnit === 'en_US') {
        water = Math.round(water * 29.5735); // fl oz to ml
    }

    // Water intake is a daily summary, so if data.water exists, use the date from the first log
    const entryDate = data.water && data.water.length > 0
        ? data.water[0].date
        : new Date().toISOString().split('T')[0];

    // Reuse existing repository function
    await measurementRepository.upsertWaterData(userId, createdByUserId, water, entryDate);
    log('info', `Upserted Fitbit water for user ${userId} on ${entryDate}: ${water} ml.`);
}

/**
 * Process Fitbit Activity/Exercise data
 */
async function processFitbitActivities(userId, createdByUserId, data, timezoneOffset = 0, distanceUnit = 'METRIC', startDate = null) {
    if (!data || !data.activities || data.activities.length === 0) return;
    for (const activity of data.activities) {
        const startIso = parseFitbitTime(activity.startTime, timezoneOffset);
        const entryDate = startIso.split('T')[0];

        // Safety filter to prevent processing very old data
        if (startDate && entryDate < startDate) {
            log('debug', `[fitbitDataProcessor] Skipping activity ${activity.activityName} from ${entryDate} (before sync range ${startDate})`);
            continue;
        }
        const exerciseName = activity.activityName || 'Fitbit Activity';

        let exercise = await exerciseRepository.findExerciseByNameAndUserId(exerciseName, userId);
        if (!exercise) {
            exercise = await exerciseRepository.createExercise({
                user_id: userId,
                name: exerciseName,
                category: activity.activityParentName || 'Other',
                source: 'Fitbit',
                is_custom: true,
                shared_with_public: false
            });
        }

        let distanceKm = activity.distance;
        // SparkyFitness expects KM.
        if (distanceKm && distanceUnit === 'en_US') {
            distanceKm = parseFloat((distanceKm * MILES_TO_KM).toFixed(2));
        }

        const entryData = {
            exercise_id: exercise.id,
            entry_date: entryDate,
            duration_minutes: Math.round(activity.duration / 60000),
            calories_burned: activity.calories,
            distance: distanceKm,
            avg_heart_rate: activity.averageHeartRate || null,
            notes: `Synced from Fitbit. Original duration: ${activity.duration}ms`,
            entry_source: 'Fitbit',
            sets: [{
                set_number: 1,
                set_type: 'Working Set',
                duration: Math.round(activity.duration / 60000),
                notes: 'Automatically created from Fitbit sync summary'
            }]
        };

        const newEntry = await exerciseEntryRepository.createExerciseEntry(userId, entryData, createdByUserId, 'Fitbit');

        if (newEntry && newEntry.id) {
            await activityDetailsRepository.createActivityDetail(userId, {
                exercise_entry_id: newEntry.id,
                provider_name: 'Fitbit',
                detail_type: 'full_activity_data',
                detail_data: activity,
                created_by_user_id: createdByUserId
            });
        }
    }
}

/**
 * Helper logic for upserting custom measurements
 */
async function upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement) {
    const { categoryName, value, unit, entryDate, entryHour, entryTimestamp, frequency } = customMeasurement;

    let categories = await measurementRepository.getCustomCategories(userId);
    let category = categories.find(cat => cat.name === categoryName);

    let categoryId;
    if (!category) {
        const newCategoryData = {
            user_id: userId,
            name: categoryName,
            display_name: categoryName,
            frequency: frequency,
            measurement_type: 'health',
            data_type: typeof value === 'number' ? 'numeric' : 'text',
            created_by_user_id: createdByUserId
        };
        const newCategory = await measurementRepository.createCustomCategory(newCategoryData);
        categoryId = newCategory.id;
    } else {
        categoryId = category.id;
    }

    await measurementRepository.upsertCustomMeasurement(
        userId,
        createdByUserId,
        categoryId,
        value,
        entryDate,
        entryHour,
        entryTimestamp,
        `Synced from Fitbit. Unit: ${unit}`,
        frequency,
        'Fitbit'
    );
}

module.exports = {
    processFitbitProfile,
    processFitbitHeartRate,
    processFitbitSteps,
    processFitbitWeight,
    processFitbitBodyFat,
    processFitbitSpO2,
    processFitbitTemperature,
    processFitbitHRV,
    processFitbitRespiratoryRate,
    processFitbitActiveZoneMinutes,
    processFitbitActivityMinutes,
    processFitbitSleep,
    processFitbitActivities,
    processFitbitWater
};
