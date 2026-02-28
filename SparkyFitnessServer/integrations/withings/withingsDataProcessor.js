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
    1: { name: 'Weight', unit: 'kg', sparky_unit: 'kg', type: 'check_in_measurement', column: 'weight', frequency: 'Daily' },
    4: { name: 'Height', unit: 'm', sparky_unit: 'cm', type: 'check_in_measurement', column: 'height', frequency: 'Daily' },
    5: { name: 'Fat Free Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Free Mass', frequency: 'Daily' },
    6: { name: 'Fat Ratio', unit: '%', sparky_unit: '%', type: 'check_in_measurement', column: 'body_fat_percentage', frequency: 'Daily' },
    8: { name: 'Fat Mass Weight', unit: 'kg', type: 'custom_measurement', categoryName: 'Fat Mass Weight', frequency: 'Daily' },
    9: { name: 'Diastolic Blood Pressure', unit: 'mmHg', type: 'custom_measurement', categoryName: 'Blood Pressure', frequency: 'Hourly' },
    10: { name: 'Systolic Blood Pressure', unit: 'mmHg', type: 'custom_measurement', categoryName: 'Blood Pressure', frequency: 'Hourly' },
    11: { name: 'Heart Pulse', unit: 'bpm', type: 'custom_measurement', categoryName: 'Heart Rate', frequency: 'Hourly' },
    12: { name: 'Body Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Body Temperature', frequency: 'Daily' },
    54: { name: 'SpO2', unit: '%', type: 'custom_measurement', categoryName: 'Blood Oxygen (SpO2)', frequency: 'Daily' },
    71: { name: 'Body Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Body Temperature', frequency: 'Daily' },
    73: { name: 'Skin Temperature', unit: 'celsius', type: 'custom_measurement', categoryName: 'Skin Temperature', frequency: 'Daily' },
    76: { name: 'Muscle Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Muscle Mass', frequency: 'Daily' },
    77: { name: 'Hydration', unit: 'kg', type: 'custom_measurement', categoryName: 'Hydration', frequency: 'Daily' },
    88: { name: 'Bone Mass', unit: 'kg', type: 'custom_measurement', categoryName: 'Bone Mass', frequency: 'Daily' },
    91: { name: 'Pulse Wave Velocity', unit: 'm/s', type: 'custom_measurement', categoryName: 'Pulse Wave Velocity', frequency: 'Daily' },
    123: { name: 'VO2 Max', unit: 'ml/min/kg', type: 'custom_measurement', categoryName: 'VO2 Max', frequency: 'Daily' },
    130: { name: 'Atrial Fibrillation Result', unit: 'boolean', type: 'custom_measurement', categoryName: 'Heart Health', frequency: 'Daily' },
    135: { name: 'QRS Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'ECG Metrics', frequency: 'Daily' },
    136: { name: 'PR Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'ECG Metrics', frequency: 'Daily' },
    137: { name: 'QT Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'ECG Metrics', frequency: 'Daily' },
    138: { name: 'Corrected QT Interval Duration', unit: 'ms', type: 'custom_measurement', categoryName: 'ECG Metrics', frequency: 'Daily' },
    139: { name: 'Atrial Fibrillation PPG', unit: 'boolean', type: 'custom_measurement', categoryName: 'Heart Health', frequency: 'Daily' },
    155: { name: 'Vascular Age', unit: 'years', type: 'custom_measurement', categoryName: 'Vascular Age', frequency: 'Daily' },
    167: { name: 'Nerve Health Score', unit: 'µS', type: 'custom_measurement', categoryName: 'Nerve Health', frequency: 'Daily' },
    168: { name: 'Extracellular Water', unit: 'kg', type: 'custom_measurement', categoryName: 'Body Water Breakdown', frequency: 'Daily' },
    169: { name: 'Intracellular Water', unit: 'kg', type: 'custom_measurement', categoryName: 'Body Water Breakdown', frequency: 'Daily' },
    170: { name: 'Visceral Fat', unit: 'index', type: 'custom_measurement', categoryName: 'Visceral Fat', frequency: 'Daily' },
    173: { name: 'Fat Free Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Segmental Body Comp', frequency: 'Daily' },
    174: { name: 'Fat Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Segmental Body Comp', frequency: 'Daily' },
    175: { name: 'Muscle Mass Segments', unit: 'kg', type: 'custom_measurement', categoryName: 'Segmental Body Comp', frequency: 'Daily' },
    196: { name: 'Electrodermal Activity', unit: 'µS', type: 'custom_measurement', categoryName: 'Stress Metrics', frequency: 'Daily' },
    226: { name: 'Basal Metabolic Rate', unit: 'kcal', type: 'custom_measurement', categoryName: 'Metabolism', frequency: 'Daily' },
    227: { name: 'Metabolic Age', unit: 'years', type: 'custom_measurement', categoryName: 'Metabolism', frequency: 'Daily' },
    229: { name: 'Electrochemical Skin Conductance', unit: 'µS', type: 'custom_measurement', categoryName: 'Nerve Health', frequency: 'Daily' },
    // Heart data (from /v2/heart API)
    'heart_rate': { name: 'Resting Heart Rate', unit: 'bpm', type: 'custom_measurement', categoryName: 'Heart Rate', frequency: 'Hourly' },
    // Sleep data (from /v2/sleep API)
    'total_sleep_duration': { name: 'Total Sleep Duration', unit: 'seconds', type: 'custom_measurement', categoryName: 'Sleep Metrics', frequency: 'Daily' },
    'wake_up_count': { name: 'Wake Up Count', unit: 'count', type: 'custom_measurement', categoryName: 'Sleep Metrics', frequency: 'Daily' },
    'sleep_score': { name: 'Sleep Score', unit: 'score', type: 'custom_measurement', categoryName: 'Sleep Metrics', frequency: 'Daily' },
    // ECG / Afib (from heart series)
    'afib': { name: 'Atrial Fibrillation Result', unit: 'boolean', type: 'custom_measurement', categoryName: 'Heart Health', frequency: 'Daily' },
};

async function processWithingsMeasures(userId, createdByUserId, measuregrps) {
    if (!Array.isArray(measuregrps) || measuregrps.length === 0) {
        log('info', `No Withings measures data to process for user ${userId}.`);
        return;
    }

    for (const group of measuregrps) {
        // Only process actual measurements (category 1), skip user objectives (category 2)
        if (group.category !== 1) continue;

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

        // Process Blood Pressure from Heart API (BPM Core)
        if (series.bloodpressure) {
            if (series.bloodpressure.systole) {
                const systolicInfo = WITHINGS_METRIC_MAPPING[10];
                await upsertCustomMeasurementLogic(userId, createdByUserId, {
                    categoryName: systolicInfo.categoryName,
                    value: series.bloodpressure.systole,
                    unit: systolicInfo.unit,
                    entryDate: entryDate,
                    entryHour: entryHour,
                    entryTimestamp: entryTimestamp,
                    frequency: systolicInfo.frequency
                }, 'Withings');
            }
            if (series.bloodpressure.diastole) {
                const diastolicInfo = WITHINGS_METRIC_MAPPING[9];
                await upsertCustomMeasurementLogic(userId, createdByUserId, {
                    categoryName: diastolicInfo.categoryName,
                    value: series.bloodpressure.diastole,
                    unit: diastolicInfo.unit,
                    entryDate: entryDate,
                    entryHour: entryHour,
                    entryTimestamp: entryTimestamp,
                    frequency: diastolicInfo.frequency
                }, 'Withings');
            }
            log('info', `Upserted Withings heart-rate-sync blood pressure for user ${userId} on ${entryDate}.`);
        }
    }
}

async function processWithingsSleepData(
  userId,
  createdByUserId,
  sleepSeries = [],
  sleepSummary = [],
) {
  // Normalize inputs to always be arrays (Withings sometimes returns a single object)
  const seriesArr = Array.isArray(sleepSeries) ? sleepSeries : (sleepSeries ? [sleepSeries] : []);
  const summaryArr = Array.isArray(sleepSummary) ? sleepSummary : (sleepSummary ? [sleepSummary] : []);

  if (seriesArr.length === 0 && summaryArr.length === 0) {
    log("info", `No Withings sleep data to process for user ${userId}.`);
    return;
  }

  // Map Withings sleep states to SparkyFitness stage types
  const SLEEP_STAGE_MAPPING = {
    0: "awake",
    1: "light",
    2: "deep",
    3: "rem",
  };

  // Identify the date range for deletion
  let minDate = null;
  let maxDate = null;

  const allRelevantEntries = [...seriesArr, ...summaryArr];
  for (const item of allRelevantEntries) {
    const timestamp = item.date || item.startdate || item.timestamp;
    if (timestamp) {
      // If date is "YYYY-MM-DD" string, use it directly, otherwise convert from unix
      const entryDate = typeof timestamp === 'string' && timestamp.includes('-')
        ? timestamp
        : new Date(timestamp * 1000).toISOString().split("T")[0];
      
      if (!minDate || entryDate < minDate) minDate = entryDate;
      if (!maxDate || entryDate > maxDate) maxDate = entryDate;
    }
  }

  if (minDate && maxDate) {
    await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
      userId,
      "Withings",
      minDate,
      maxDate,
    );
    log(
      "info",
      `Deleted existing Withings sleep entries between ${minDate} and ${maxDate} for user ${userId}.`,
    );
  }

  const sleepEntryMap = new Map(); // entry_date -> db_id

  // 1. Process Summaries (The most reliable source for high-level metrics)
  for (const summary of summaryArr) {
    const entryDate = typeof summary.date === 'string' 
      ? summary.date 
      : new Date(summary.date * 1000).toISOString().split("T")[0];
    
    // Default to start/end dates
    let bedtimeTs = summary.startdate;
    let wakeTimeTs = summary.enddate;

    // Refine with night_events if available (1=got in bed, 4=got out of bed)
    if (summary.data.night_events) {
      const events = summary.data.night_events;
      // Withings says keys are strings of the event type, value is array of offsets
      if (events["1"] && events["1"].length > 0) {
        bedtimeTs = summary.startdate + events["1"][0];
      }
      if (events["4"] && events["4"].length > 0) {
        wakeTimeTs = summary.startdate + events["4"][events["4"].length - 1];
      }
    }

    const bedtime = new Date(bedtimeTs * 1000).toISOString();
    const wakeTime = new Date(wakeTimeTs * 1000).toISOString();

    const sleepEntryData = {
      entry_date: entryDate,
      bedtime: bedtime,
      wake_time: wakeTime,
      duration_in_seconds: summary.data.total_timeinbed || 0,
      time_asleep_in_seconds: summary.data.total_sleep_time || 0,
      sleep_score: summary.data.sleep_score || 0,
      source: "Withings",
      awake_count: summary.data.wakeupcount || 0,
      deep_sleep_seconds: summary.data.deepsleepduration || 0,
      light_sleep_seconds: summary.data.lightsleepduration || 0,
      rem_sleep_seconds: summary.data.remsleepduration || 0,
      awake_sleep_seconds: summary.data.wakeupduration || 0,
      resting_heart_rate: summary.data.hr_average || null,
      average_respiration_value: summary.data.rr_average || null,
      lowest_respiration_value: summary.data.rr_min || null,
      highest_respiration_value: summary.data.rr_max || null,
    };

    const createdEntry = await sleepRepository.upsertSleepEntry(
      userId,
      createdByUserId,
      sleepEntryData,
    );
    sleepEntryMap.set(entryDate, createdEntry.id);
    log("info", `Processed sleep summary for ${entryDate} for user ${userId}.`);
  }

  // 2. Process Detailed Series (Sleep Stages)
  const stagesByDate = new Map();

  for (const segment of seriesArr) {
    if (segment.startdate && segment.state !== undefined) {
      const segmentStart = new Date(segment.startdate * 1000);
      const entryDate = segmentStart.toISOString().split("T")[0];

      if (!stagesByDate.has(entryDate)) {
        stagesByDate.set(entryDate, []);
      }
      stagesByDate.get(entryDate).push(segment);
    }
  }

  for (const [entryDate, segments] of stagesByDate.entries()) {
    let entryId = sleepEntryMap.get(entryDate);

    // If no summary was found for this date, we create a basic entry from the series
    if (!entryId) {
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const bedtime = new Date(firstSegment.startdate * 1000).toISOString();
      const wakeTime = new Date(lastSegment.enddate * 1000).toISOString();

      const basicEntry = await sleepRepository.upsertSleepEntry(
        userId,
        createdByUserId,
        {
          entry_date: entryDate,
          bedtime: bedtime,
          wake_time: wakeTime,
          source: "Withings",
          duration_in_seconds: lastSegment.enddate - firstSegment.startdate,
          time_asleep_in_seconds: 0, 
        },
      );
      entryId = basicEntry.id;
      sleepEntryMap.set(entryDate, entryId);
    }

    const stageAggregates = { deep: 0, light: 0, rem: 0, awake: 0 };

    for (const segment of segments) {
      const duration = segment.enddate - segment.startdate;
      const stageType = SLEEP_STAGE_MAPPING[segment.state] || "awake";
      const stageKey = stageType; // Already lowercase from SLEEP_STAGE_MAPPING

      if (stageAggregates[stageKey] !== undefined) {
        stageAggregates[stageKey] += duration;
      }

      await sleepRepository.upsertSleepStageEvent(userId, entryId, {
        stage_type: stageType,
        start_time: new Date(segment.startdate * 1000).toISOString(),
        end_time: new Date(segment.enddate * 1000).toISOString(),
        duration_in_seconds: duration,
      });
    }

    await sleepRepository.updateSleepEntry(userId, entryId, createdByUserId, {
      deep_sleep_seconds: stageAggregates.deep,
      light_sleep_seconds: stageAggregates.light,
      rem_sleep_seconds: stageAggregates.rem,
      awake_sleep_seconds: stageAggregates.awake,
      time_asleep_in_seconds:
        stageAggregates.deep + stageAggregates.light + stageAggregates.rem,
    });
    
    log("info", `Processed ${segments.length} sleep stages for ${entryDate} for user ${userId}.`);
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

async function processWithingsActivity(userId, createdByUserId, activities = []) {
    if (!Array.isArray(activities) || activities.length === 0) {
        log('info', `No Withings activity data to process for user ${userId}.`);
        return;
    }

    for (const activity of activities) {
        const entryDate = activity.date; // "YYYY-MM-DD"
        
        // 1. Process Steps
        if (activity.steps !== undefined) {
            await measurementRepository.upsertStepData(userId, createdByUserId, activity.steps, entryDate);
            log('info', `Upserted Withings daily steps for user ${userId} on ${entryDate}: ${activity.steps}.`);
        }

        // 2. Process Total Calories (Active + Passive)
        if (activity.totalcalories !== undefined) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Metabolism',
                value: activity.totalcalories,
                unit: 'kcal',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            }, 'Withings');
        }

        // 3. Process Elevation (Floors)
        if (activity.elevation !== undefined) {
            await upsertCustomMeasurementLogic(userId, createdByUserId, {
                categoryName: 'Floors Climbed',
                value: activity.elevation,
                unit: 'count',
                entryDate: entryDate,
                entryHour: 0,
                entryTimestamp: new Date(entryDate).toISOString(),
                frequency: 'Daily'
            }, 'Withings');
        }
    }
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
                notes: `Logged from Withings workout: ${exercise.name}. Distance: ${workout.data.distance || 0}m, Steps: ${workout.data.steps || 0}. Intensity: ${workout.data.intensity || 0}/100.`,
                avg_heart_rate: workout.data.hr_average || null,
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

            const newEntry = await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, createdByUserId, 'Withings'); 
            log('info', `Logged Withings workout entry for user ${userId}: ${exercise.name} on ${entryDate}.`);

            // Add activity details (HR Zones, etc.)
            if (newEntry && newEntry.id) {
                const activityDetailsRepository = require('../../models/activityDetailsRepository');
                await activityDetailsRepository.createActivityDetail(userId, {
                    exercise_entry_id: newEntry.id,
                    provider_name: 'Withings',
                    detail_type: 'workout_summary',
                    detail_data: {
                        ...workout.data,
                        hr_zones: {
                            light: workout.data.hr_zone_0,
                            moderate: workout.data.hr_zone_1,
                            intense: workout.data.hr_zone_2,
                            peak: workout.data.hr_zone_3
                        }
                    },
                    created_by_user_id: createdByUserId
                });
            }

        } catch (error) {
            log('error', `Error processing Withings workout for user ${userId}, workout category ${workout.category}: ${error.name}: ${error.message}`);
        }
    }
}

module.exports = {
    processWithingsMeasures,
    processWithingsHeartData,
    processWithingsSleepData,
    processWithingsActivity,
    processWithingsWorkouts,
};