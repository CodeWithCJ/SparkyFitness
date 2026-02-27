// SparkyFitnessServer/integrations/withings/withingsDataProcessor.js

const measurementRepository = require('../../models/measurementRepository');
const { log } = require('../../config/logging');
const exerciseRepository = require('../../models/exercise'); // Import exercise repository
const exerciseEntryRepository = require('../../models/exerciseEntry'); // Import exerciseEntry repository
const sleepRepository = require('../../models/sleepRepository'); // Import sleep repository

// Define a mapping for Withings metric types to SparkyFitness measurement types
// This can be extended as more Withings metrics are integrated
const WITHINGS_METRIC_MAPPING = {
    // Measures (Weight, Blood Pressure, etc.)
    // 'unit' is the unit from Withings API (after scaling).
    // 'sparky_unit' is the unit expected by SparkyFitness for storage.
    // 'frequency' is for custom measurements.
    1: { name: 'Weight', unit: 'kg', sparky_unit: 'kg', type: 'check_in_measurement', column: 'weight', frequency: 'Daily' }, // Weight in kg
    4: { name: 'Height', unit: 'm', sparky_unit: 'cm', type: 'check_in_measurement', column: 'height', frequency: 'Daily' }, // Height in meters from Withings, convert to cm for SparkyFitness
    5: { name: 'Fat Free Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Free Mass', frequency: 'Daily' }, // Fat Free Mass in kg
    6: { name: 'Fat Ratio', unit: '%', sparky_unit: '%', type: 'check_in_measurement', column: 'body_fat_percentage', frequency: 'Daily' }, // Fat Ratio in percentage
    8: { name: 'Fat Mass Weight', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Mass Weight', frequency: 'Daily' }, // Fat Mass Weight in kg
    9: { name: 'Diastolic Blood Pressure', unit: 'mmHg', type: 'custom_measurement', categoryName: 'Diastolic Blood Pressure', frequency: 'Hourly' }, // Diastolic Blood Pressure in mmHg
    10: { name: 'Systolic Blood Pressure', unit: 'mmHg', type: 'custom_measurement', categoryName: 'Systolic Blood Pressure', frequency: 'Hourly' }, // Systolic Blood Pressure in mmHg
    11: { name: 'Heart Pulse', unit: 'bpm', type: 'custom_measurement', categoryName: 'Heart Pulse', frequency: 'Hourly' }, // Heart Pulse (bpm) - only for BPM and scale devices
    12: { name: 'Body Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Body Temperature', frequency: 'Daily' }, // Temperature (celsius)
    54: { name: 'SpO2', unit: '%', type: 'custom_measurement', categoryName: 'SpO2', frequency: 'Daily' }, // SP02 (%)
    71: { name: 'Body Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Body Temperature', frequency: 'Daily' }, // Body Temperature (celsius) - assuming this is distinct or a more specific type
    73: { name: 'Skin Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Skin Temperature', frequency: 'Daily' }, // Skin Temperature (celsius)
    76: { name: 'Muscle Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Muscle Mass', frequency: 'Daily' }, // Muscle Mass (kg)
    77: { name: 'Hydration', unit: 'kg', type: 'custom_measurement', categoryName: 'Hydration', frequency: 'Daily' }, // Hydration (kg)
    88: { name: 'Bone Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Bone Mass', frequency: 'Daily' }, // Bone Mass (kg)
    91: { name: 'Pulse Wave Velocity', unit: 'm/s', type: 'custom_measurement', categoryName: 'Pulse Wave Velocity', frequency: 'Daily' }, // Pulse Wave Velocity (m/s)
    123: { name: 'VO2 Max', unit: 'ml/min/kg', type: 'custom_measurement', categoryName: 'VO2 Max', frequency: 'Daily' }, // VO2 max is a numerical measurement of your body’s ability to consume oxygen (ml/min/kg).
    130: { name: 'Atrial Fibrillation Result', unit: 'boolean', type: 'custom_measurement', categoryName: 'Atrial Fibrillation Result', frequency: 'Daily' }, // Atrial fibrillation result (assuming 0/1 for boolean)
    135: { name: 'QRS Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'QRS Interval Duration', frequency: 'Daily' }, // QRS interval duration based on ECG signal
    136: { name: 'PR Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'PR Interval Duration', frequency: 'Daily' }, // PR interval duration based on ECG signal
    137: { name: 'QT Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'QT Interval Duration', frequency: 'Daily' }, // QT interval duration based on ECG signal
    138: { name: 'Corrected QT Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'Corrected QT Interval Duration', frequency: 'Daily' }, // Corrected QT interval duration based on ECG signal
    139: { name: 'Atrial Fibrillation PPG', unit: 'boolean', type: 'custom_measurement', categoryName: 'Atrial Fibrillation PPG', frequency: 'Daily' }, // Atrial fibrillation result from PPG (assuming 0/1 for boolean)
    155: { name: 'Vascular Age', unit: 'years', type: 'custom_measurement', categoryName: 'Vascular Age', frequency: 'Daily' }, // Vascular age
    167: { name: 'Nerve Health Score', unit: 'µS', type: 'custom_measurement', categoryName: 'Nerve Health Score', frequency: 'Daily' }, // Nerve Health Score Conductance 2 electrodes Feet
    168: { name: 'Extracellular Water', unit: 'kg', type: 'custom_measurement', categoryName: 'Extracellular Water', frequency: 'Daily' }, // Extracellular Water in kg
    169: { name: 'Intracellular Water', unit: 'kg', type: 'custom_measurement', categoryName: 'Intracellular Water', frequency: 'Daily' }, // Intracellular Water in kg
    170: { name: 'Visceral Fat', unit: 'index', type: 'custom_measurement', categoryName: 'Visceral Fat', frequency: 'Daily' }, // Visceral Fat (without unity)
    173: { name: 'Fat Free Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Free Mass Segments', frequency: 'Daily' }, // Fat Free Mass for segments
    174: { name: 'Fat Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Mass Segments', frequency: 'Daily' }, // Fat Mass for segments in mass unit
    175: { name: 'Muscle Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Muscle Mass Segments', frequency: 'Daily' }, // Muscle Mass for segments
    196: { name: 'Electrodermal Activity', unit: 'µS', type: 'custom_measurement', categoryName: 'Electrodermal Activity', frequency: 'Daily' }, // Electrodermal activity feet
    226: { name: 'Basal Metabolic Rate', unit: 'kcal', type: 'custom_measurement', categoryName: 'Basal Metabolic Rate', frequency: 'Daily' }, // Basal Metabolic Rate (BMR)
    227: { name: 'Metabolic Age', unit: 'years', type: 'custom_measurement', categoryName: 'Metabolic Age', frequency: 'Daily' }, // Metabolic Age
    229: { name: 'Electrochemical Skin Conductance', unit: 'µS', type: 'custom_measurement', categoryName: 'Electrochemical Skin Conductance', frequency: 'Daily' }, // Electrochemical Skin Conductance (ESC)
    // Heart data (from /v2/heart API)
    'heart_rate': { name: 'Resting Heart Rate', unit: 'bpm', type: 'custom_measurement', categoryName: 'Resting Heart Rate', frequency: 'Hourly' },
    // Sleep data (from /v2/sleep API)
    'total_sleep_duration': { name: 'Total Sleep Duration', unit: 'seconds', type: 'custom_measurement', categoryName: 'Total Sleep Duration', frequency: 'Daily' },
    'wake_up_count': { name: 'Wake Up Count', unit: 'count', type: 'custom_measurement', categoryName: 'Wake Up Count', frequency: 'Daily' },
    'sleep_score': { name: 'Sleep Score', unit: 'score', type: 'custom_measurement', categoryName: 'Sleep Score', frequency: 'Daily' },
    // ECG / Afib (from heart series)
    'afib': { name: 'Atrial Fibrillation Result', unit: 'boolean', type: 'custom_measurement', categoryName: 'Atrial Fibrillation Result', frequency: 'Daily' },
};

async function processWithingsMeasures(userId, createdByUserId, measuregrps) {
    if (!Array.isArray(measuregrps) || measuregrps.length === 0) {
        log('info', `No Withings measures data to process for user ${userId}.`);
        return;
    }

    for (const group of measuregrps) {
        const timestamp = group.date || group.timestamp;
        if (!timestamp || isNaN(timestamp)) {
            log('warn', `Invalid date/timestamp in Withings measure group: ${JSON.stringify(group)}`);
            continue;
        }
        const entryDate = new Date(timestamp * 1000).toISOString().split('T')[0]; // Convert Unix timestamp to YYYY-MM-DD
        const measurementsToUpsert = {};
        const customMeasurementsToUpsert = [];

        for (const measure of group.measures) {
            const metricInfo = WITHINGS_METRIC_MAPPING[measure.type];
            if (metricInfo) {
                // Withings measures often come with a 'unit' field which is a power of 10.
                // E.g., weight in kg with unit 0 means actual kg, unit -1 means 0.1 kg.
                let value = measure.value * Math.pow(10, measure.unit); // Use measure.unit from Withings API for scaling

                // Apply unit conversions for check_in_measurement types if needed
                if (metricInfo.type === 'check_in_measurement' && metricInfo.sparky_unit) {
                    if (metricInfo.unit === 'm' && metricInfo.sparky_unit === 'cm') {
                        value *= 100; // Convert meters to centimeters
                    }
                    // Add other conversions here if necessary (e.g., kg to lbs, but assuming kg is standard for now)
                }

                if (metricInfo.type === 'check_in_measurement' && metricInfo.column) {
                    measurementsToUpsert[metricInfo.column] = value;
                } else if (metricInfo.type === 'custom_measurement' && metricInfo.categoryName) {
                    customMeasurementsToUpsert.push({
                        categoryName: metricInfo.categoryName,
                        value: value,
                        unit: metricInfo.unit, // Store Withings unit for custom measurements
                        entryDate: entryDate,
                        entryHour: new Date(timestamp * 1000).getUTCHours(), // Use UTC hour
                        entryTimestamp: new Date(timestamp * 1000).toISOString(),
                        frequency: metricInfo.frequency // Use frequency from mapping
                    });
                }
            } else {
                log('warn', `Unknown Withings measure type: ${measure.type}. Skipping.`);
            }
        }

        // Upsert into check_in_measurements if there are any standard measurements
        if (Object.keys(measurementsToUpsert).length > 0) {
            await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, entryDate, measurementsToUpsert);
            log('info', `Upserted standard Withings measures for user ${userId} on ${entryDate}.`);
        }

        // Upsert into custom_measurements
        for (const customMeasurement of customMeasurementsToUpsert) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement, 'Withings');
        }
    }
}

async function processWithingsHeartData(userId, createdByUserId, heartSeries = []) {
    if (!Array.isArray(heartSeries) || heartSeries.length === 0) {
        log('info', `No Withings heart data to process for user ${userId}.`);
        return;
    }

    for (const series of heartSeries) {
        const timestamp = series.date || series.timestamp;
        if (!timestamp || isNaN(timestamp)) {
            log('warn', `Invalid date/timestamp in Withings heart series: ${JSON.stringify(series)}`);
            continue;
        }

        const entryDate = new Date(timestamp * 1000).toISOString().split('T')[0];
        const entryHour = new Date(timestamp * 1000).getUTCHours();
        const entryTimestamp = new Date(timestamp * 1000).toISOString();

        // Process Heart Rate
        if (series.heart_rate) {
            const metricInfo = WITHINGS_METRIC_MAPPING.heart_rate;
            const customMeasurement = {
                categoryName: metricInfo.categoryName,
                value: series.heart_rate,
                unit: metricInfo.unit,
                entryDate: entryDate,
                entryHour: entryHour,
                entryTimestamp: entryTimestamp,
                frequency: metricInfo.frequency
            };
            await upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement, 'Withings');
            log('info', `Upserted Withings heart rate for user ${userId} on ${entryDate}.`);
        }

        // Process Afib from ECG
        if (series.ecg && series.ecg.afib !== undefined) {
            const metricInfo = WITHINGS_METRIC_MAPPING.afib;
            const customMeasurement = {
                categoryName: metricInfo.categoryName,
                value: series.ecg.afib,
                unit: metricInfo.unit,
                entryDate: entryDate,
                entryHour: entryHour,
                entryTimestamp: entryTimestamp,
                frequency: metricInfo.frequency
            };
            await upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement, 'Withings');
            log('info', `Upserted Withings afib result for user ${userId} on ${entryDate}.`);
        }
    }
}

async function processWithingsSleepData(userId, createdByUserId, sleepSeries = []) {
    if (!Array.isArray(sleepSeries) || sleepSeries.length === 0) {
        log('info', `No Withings sleep data to process for user ${userId}.`);
        return;
    }

    // Map Withings sleep states to SparkyFitness stage types
    const SLEEP_STAGE_MAPPING = {
        0: 'Awake',
        1: 'Light',
        2: 'Deep',
        3: 'REM'
    };

    // First, identify the date range to delete existing Withings sleep entries
    let minDate = null;
    let maxDate = null;

    for (const series of sleepSeries) {
        const timestamp = series.date || series.startdate;
        if (timestamp) {
            const entryDate = new Date(timestamp * 1000).toISOString().split('T')[0];
            if (!minDate || entryDate < minDate) minDate = entryDate;
            if (!maxDate || entryDate > maxDate) maxDate = entryDate;
        }
    }

    if (minDate && maxDate) {
        await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(userId, 'Withings', minDate, maxDate);
        log('info', `Deleted existing Withings sleep entries between ${minDate} and ${maxDate} for user ${userId}.`);
    }

    // Map to keep track of created sleep entries by date
    const sleepEntryMap = new Map();

    // Pass 1: Process Summary Objects (Sleep Entries)
    for (const series of sleepSeries) {
        if (series.date && series.data) {
            const timestamp = series.date;
            const entryDate = new Date(timestamp * 1000).toISOString().split('T')[0];
            const bedtime = new Date(series.data.bedtime * 1000).toISOString();
            const wakeTime = new Date(series.data.wakeup_time * 1000).toISOString();
            
            const sleepEntryData = {
                entry_date: entryDate,
                bedtime: bedtime,
                wake_time: wakeTime,
                duration_in_seconds: series.data.total_sleep_time + series.data.total_timeinbed - series.data.total_sleep_time, // Approximation if needed
                time_asleep_in_seconds: series.data.total_sleep_time,
                sleep_score: series.data.sleep_score,
                source: 'Withings',
                awake_count: series.data.wakeup_count,
                // These will be updated if stage data is found later
                deep_sleep_seconds: 0,
                light_sleep_seconds: 0,
                rem_sleep_seconds: 0,
                awake_sleep_seconds: 0
            };

            const createdEntry = await sleepRepository.upsertSleepEntry(userId, createdByUserId, sleepEntryData);
            sleepEntryMap.set(entryDate, createdEntry.id);

            // Also upsert into custom_measurements for consistency
            const sleepMetrics = [
                { key: 'total_sleep_duration', value: series.data.total_sleep_time },
                { key: 'wake_up_count', value: series.data.wakeup_count },
                { key: 'sleep_score', value: series.data.sleep_score }
            ];

            for (const metric of sleepMetrics) {
                const metricInfo = WITHINGS_METRIC_MAPPING[metric.key];
                if (metricInfo && metric.value !== undefined && metric.value !== null) {
                    const customMeasurement = {
                        categoryName: metricInfo.categoryName,
                        value: metric.value,
                        unit: metricInfo.unit,
                        entryDate: entryDate,
                        entryHour: null,
                        entryTimestamp: new Date(timestamp * 1000).toISOString(),
                        frequency: metricInfo.frequency
                    };
                    await upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement, 'Withings');
                }
            }
        }
    }

    // Pass 2: Process Stage Segments and Aggregate
    const stageAggregates = new Map(); // Map<Date, {deep, light, rem, awake}>

    for (const series of sleepSeries) {
        if (series.startdate && series.state !== undefined) {
            const startDate = new Date(series.startdate * 1000);
            const entryDate = startDate.toISOString().split('T')[0];
            const entryId = sleepEntryMap.get(entryDate);

            if (entryId) {
                const duration = series.enddate - series.startdate;
                const stageType = SLEEP_STAGE_MAPPING[series.state] || 'Awake';
                
                // Initialize aggregate for this date if not present
                if (!stageAggregates.has(entryDate)) {
                    stageAggregates.set(entryDate, { deep: 0, light: 0, rem: 0, awake: 0 });
                }
                const agg = stageAggregates.get(entryDate);
                const fieldKey = stageType.toLowerCase();
                if (agg[fieldKey] !== undefined) {
                    agg[fieldKey] += duration;
                }

                const stageData = {
                    stage_type: stageType,
                    start_time: startDate.toISOString(),
                    end_time: new Date(series.enddate * 1000).toISOString(),
                    duration_in_seconds: duration
                };

                await sleepRepository.upsertSleepStageEvent(userId, entryId, stageData);
            }
        }
    }

    // Pass 3: Update Summary Aggregates
    for (const [entryDate, agg] of stageAggregates.entries()) {
        const entryId = sleepEntryMap.get(entryDate);
        if (entryId) {
            const updateData = {
                deep_sleep_seconds: agg.deep,
                light_sleep_seconds: agg.light,
                rem_sleep_seconds: agg.rem,
                awake_sleep_seconds: agg.awake
            };
            await sleepRepository.updateSleepEntry(userId, entryId, createdByUserId, updateData);
            log('info', `Updated summary aggregates for sleep entry ${entryDate} (Deep: ${agg.deep}s, Light: ${agg.light}s, REM: ${agg.rem}s, Awake: ${agg.awake}s).`);
        }
    }
}

async function upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement, source = 'manual') {
    const { categoryName, value, unit, entryDate, entryHour, entryTimestamp, frequency } = customMeasurement;

    let category = await measurementRepository.getCustomCategories(userId);
    category = category.find(cat => cat.name === categoryName);

    let categoryId;
    if (!category) {
        // Create new custom category if it doesn't exist
        const newCategoryData = {
            user_id: userId,
            name: categoryName,
            frequency: frequency, // 'Daily', 'Hourly', 'All', 'Unlimited'
            measurement_type: 'health', // Or a more specific type if available
            data_type: typeof value === 'number' ? 'numeric' : 'text',
            created_by_user_id: createdByUserId
        };
        const newCategory = await measurementRepository.createCustomCategory(newCategoryData);
        categoryId = newCategory.id;
        log('info', `Created new custom category '${categoryName}' for user ${userId}.`);
    } else {
        categoryId = category.id;
    }

    // Upsert the custom measurement entry
    await measurementRepository.upsertCustomMeasurement(
        userId,
        createdByUserId,
        categoryId,
        value,
        entryDate,
        entryHour,
        entryTimestamp,
        null, // notes
        frequency,
        source
    );
}

async function processWithingsWorkouts(userId, createdByUserId, workouts = []) {
    if (!Array.isArray(workouts) || workouts.length === 0) {
        log('info', `No Withings workout data to process for user ${userId}.`);
        return;
    }

    // Define a mapping for Withings workout categories to SparkyFitness exercise names
    // This list can be expanded as more categories are identified or requested.
    const WITHINGS_WORKOUT_CATEGORY_MAPPING = {
        1: "Walk",
        2: "Run",
        3: "Hiking",
        4: "Skating",
        5: "BMX",
        6: "Cycling",
        7: "Swimming",
        8: "Surfing",
        9: "Kitesurfing",
        10: "Windsurfing",
        11: "Bodyboard",
        12: "Tennis",
        13: "Table Tennis",
        14: "Squash",
        15: "Badminton",
        16: "Lift Weights",
        17: "Calisthenics",
        18: "Elliptical",
        19: "Pilates",
        20: "Basketball",
        21: "Soccer",
        22: "Football",
        23: "Rugby",
        24: "Volleyball",
        25: "Waterpolo",
        26: "Horse Riding",
        27: "Golf",
        28: "Yoga",
        29: "Dancing",
        30: "Boxing",
        31: "Fencing",
        32: "Wrestling",
        33: "Martial Arts",
        34: "Skiing",
        35: "Snowboarding",
        36: "Other",
        128: "No Activity",
        187: "Rowing",
        188: "Zumba",
        191: "Baseball",
        192: "Handball",
        193: "Hockey",
        194: "Ice Hockey",
        195: "Climbing",
        196: "Ice Skating",
        272: "MultiSport",
        306: "Indoor Walking",
        307: "Indoor Running",
        308: "Indoor Cycling",
    };

    // First, delete all existing Withings exercise entries for the date range to prevent duplicates.
    // We iterate through the dates covered by the workouts and delete entries for each day,
    // specifically targeting entries with 'Withings' as their source.
    const processedDates = new Set();
    for (const workout of workouts) {
        if (!workout.startdate || isNaN(workout.startdate)) {
            log('warn', `Invalid startdate in Withings workout: ${JSON.stringify(workout)}`);
            continue;
        }
        const entryDate = new Date(workout.startdate * 1000).toISOString().split('T')[0];
        if (!processedDates.has(entryDate)) {
            await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(userId, entryDate, entryDate, 'Withings');
            processedDates.add(entryDate);
        }
    }

    for (const workout of workouts) {
        try {
            const workoutCategory = workout.category;
            const exerciseName = WITHINGS_WORKOUT_CATEGORY_MAPPING[workoutCategory] || `Withings Workout - Category ${workoutCategory}`;
            // The sourceId for the exercise definition remains the same, as it identifies the type of exercise.
            const exerciseSourceId = `withings-workout-${workoutCategory}`;
 
            let exercise = await exerciseRepository.getExerciseBySourceAndSourceId('Withings', exerciseSourceId); // Corrected variable name
 
            if (!exercise) {
                // If not found by source and sourceId, try to find by name (for user-created exercises)
                const searchResults = await exerciseRepository.searchExercises(exerciseName, userId);
                if (searchResults && searchResults.length > 0) {
                    exercise = searchResults[0]; // Use the first matching exercise
                    log('info', `Found existing exercise by name for Withings workout category ${workoutCategory}: ${exerciseName}`);
                }
            }

            if (!exercise) {
                const durationSeconds = workout.enddate - workout.startdate;
                // Create a new exercise if it doesn't exist
                const newExerciseData = {
                    user_id: userId,
                    name: exerciseName,
                    category: 'Cardio', // Default category, can be refined
                    calories_per_hour: (workout.data.calories && durationSeconds > 0) ? Math.round(workout.data.calories / (durationSeconds / 3600)) : 300, // Estimate if possible, round to nearest integer
                    description: `Automatically created from Withings workout category ${workoutCategory}.`,
                    is_custom: true,
                    shared_with_public: false,
                    source: 'Withings',
                    source_id: exerciseSourceId, // Corrected variable name
                };
                log('debug', `Withings workout.data.calories: ${workout.data.calories}, durationSeconds: ${durationSeconds}`);
                log('debug', `Withings workout raw data: ${JSON.stringify(workout.data)}`);
                log('debug', `New exercise data before creation: ${JSON.stringify(newExerciseData)}`);
                exercise = await exerciseRepository.createExercise(newExerciseData);
                log('info', `Created new exercise for Withings workout category ${workoutCategory}: ${exercise.name}`);
            }

            // Calculate duration in minutes
            const durationSeconds = workout.enddate - workout.startdate;
            const durationMinutes = Math.round(durationSeconds / 60);

            // Prepare exercise entry data
            const entryDate = new Date(workout.startdate * 1000).toISOString().split('T')[0];
            const caloriesBurned = workout.data.calories || 0;

            const exerciseEntryData = {
                exercise_id: exercise.id,
                duration_minutes: durationMinutes,
                calories_burned: caloriesBurned,
                entry_date: entryDate,
                notes: `Logged from Withings workout: ${exercise.name}. Distance: ${workout.data.distance || 0}m, Steps: ${workout.data.steps || 0}.`,
                sets: [{
                    set_number: 1,
                    set_type: 'Working Set',
                    reps: 1,
                    weight: 0,
                    duration: durationMinutes,
                    rest_time: 0,
                    notes: ''
                }]
            };

            await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, createdByUserId, 'Withings'); // Pass 'Withings' as entrySource
            log('info', `Logged Withings workout entry for user ${userId}: ${exercise.name} on ${entryDate}.`);

        } catch (error) {
            log('error', `Error processing Withings workout for user ${userId}, workout category ${workout.category}: ${error.name}: ${error.message}`);
        }
    }
}

module.exports = {
    processWithingsMeasures,
    processWithingsHeartData,
    processWithingsSleepData,
    processWithingsWorkouts, // Export the new function
};